import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  TEAM_RANGE = 'Sheet1!A2:E',
  TEAM_CACHE_TTL_MS = 5 * 60 * 1000
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const SHEET_TAB = TEAM_RANGE.split('!')[0]

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let cache = { members: [], fetchedAt: 0 }
let sheetIdCache = null

function rowToMember(row, rowNumber) {
  const [email, role, name, joinedOn, mobile] = row
  return {
    rowNumber,
    email: (email || '').trim().toLowerCase(),
    role: (role || 'guest').trim().toLowerCase(),
    name: (name || '').trim(),
    joinedOn: (joinedOn || '').trim(),
    mobile: (mobile || '').trim()
  }
}

async function fetchMembers({ force = false } = {}) {
  const isStale = force || Date.now() - cache.fetchedAt > Number(TEAM_CACHE_TTL_MS)
  if (!isStale) return cache.members

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: TEAM_RANGE })
  const members = (res.data.values || [])
    .map((row, i) => rowToMember(row, i + 2))
    .filter((m) => m.email)
  cache = { members, fetchedAt: Date.now() }
  return members
}

async function getSheetId() {
  if (sheetIdCache !== null) return sheetIdCache
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
  const tab = data.sheets.find((s) => s.properties.title === SHEET_TAB)
  if (!tab) throw new Error(`Sheet tab "${SHEET_TAB}" not found`)
  sheetIdCache = tab.properties.sheetId
  return sheetIdCache
}

// Looks up a role from the cached sheet data, refreshing it once the TTL
// expires. If a refresh fails (sheet unreachable, quota, etc), keeps serving
// the last known list rather than locking everyone out.
export async function getRole(email) {
  let members
  try {
    members = await fetchMembers()
  } catch (err) {
    console.error('Failed to refresh team list from Google Sheets, using last known list:', err.message)
    if (cache.fetchedAt === 0) throw err
    members = cache.members
  }
  return members.find((m) => m.email === email.toLowerCase())?.role || 'guest'
}

// Admin/staff only, in sheet row order - guests aren't listed here.
export async function listTeam() {
  const members = await fetchMembers()
  return members.filter((m) => m.role === 'admin' || m.role === 'staff')
}

export async function addTeamMember({ email, role, name, joinedOn, mobile }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: TEAM_RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[email.trim().toLowerCase(), role, name, joinedOn, mobile]] }
  })
  await fetchMembers({ force: true })
}

export async function updateTeamMember(email, updates) {
  const members = await fetchMembers({ force: true })
  const existing = members.find((m) => m.email === email.toLowerCase())
  if (!existing) throw new Error('Team member not found')

  const merged = { ...existing, ...updates }
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${SHEET_TAB}!A${existing.rowNumber}:E${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[merged.email.trim().toLowerCase(), merged.role, merged.name, merged.joinedOn, merged.mobile]] }
  })
  await fetchMembers({ force: true })
}

export async function removeTeamMember(email) {
  const members = await fetchMembers({ force: true })
  const existing = members.find((m) => m.email === email.toLowerCase())
  if (!existing) throw new Error('Team member not found')

  const sheetId = await getSheetId()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEETS_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: existing.rowNumber - 1, endIndex: existing.rowNumber }
        }
      }]
    }
  })
  await fetchMembers({ force: true })
}
