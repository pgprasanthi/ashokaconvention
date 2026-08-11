import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  GUESTS_TAB = 'Guests'
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const HEADER = ['Email', 'Name', 'First Sign-In', 'Last Sign-In']

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null

// Creates the Guests tab (separate from the Team/Staff tab) the first time
// it's needed, so no manual sheet setup is required.
async function ensureTab() {
  if (tabReady) return tabReady
  tabReady = (async () => {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
    const exists = data.sheets.some((s) => s.properties.title === GUESTS_TAB)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: GUESTS_TAB } } }] }
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${GUESTS_TAB}!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

function rowToGuest(row, rowNumber) {
  const [email, name, firstSeen, lastSeen] = row
  return { rowNumber, email: (email || '').trim().toLowerCase(), name: name || '', firstSeen: firstSeen || '', lastSeen: lastSeen || '' }
}

async function fetchGuests() {
  await ensureTab()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: `${GUESTS_TAB}!A2:D` })
  return (res.data.values || []).map((row, i) => rowToGuest(row, i + 2)).filter((g) => g.email)
}

export async function listGuests() {
  return fetchGuests()
}

// Called on every guest sign-in. Adds a new row the first time, otherwise
// just bumps "Last Sign-In" on their existing row.
export async function recordGuestSignIn({ email, name }) {
  const now = new Date().toISOString()
  const guests = await fetchGuests()
  const existing = guests.find((g) => g.email === email.toLowerCase())

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${GUESTS_TAB}!D${existing.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[now]] }
    })
    return
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${GUESTS_TAB}!A2:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[email.toLowerCase(), name || '', now, now]] }
  })
}
