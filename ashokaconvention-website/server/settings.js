import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  SETTINGS_TAB = 'Settings'
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const HEADER = ['Key', 'Value']

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null

// A generic key-value tab for small app-wide settings (e.g. WhatsApp
// auto-message text/toggles) - deliberately schema-less beyond Key/Value, so
// adding a new setting later never requires a header migration the way the
// Events/WhatsApp Leads tabs have needed in the past.
async function ensureTab() {
  if (tabReady) return tabReady
  tabReady = (async () => {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
    const exists = data.sheets.some((s) => s.properties.title === SETTINGS_TAB)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: SETTINGS_TAB } } }] }
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${SETTINGS_TAB}!A1:B1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

async function fetchRows() {
  await ensureTab()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: `${SETTINGS_TAB}!A2:B` })
  return (res.data.values || []).map((row, i) => ({ rowNumber: i + 2, key: (row[0] || '').trim(), value: row[1] ?? '' }))
}

// Returns every setting as a flat { key: value } object. Callers apply their
// own defaults for keys that aren't present yet.
export async function getSettings() {
  const rows = await fetchRows()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// Upserts one or more key-value pairs in a single batch call.
export async function updateSettings(updates) {
  const rows = await fetchRows()
  const rowByKey = new Map(rows.map((r) => [r.key, r]))

  const data = []
  const newRows = []
  for (const [key, value] of Object.entries(updates)) {
    const existing = rowByKey.get(key)
    if (existing) {
      data.push({ range: `${SETTINGS_TAB}!B${existing.rowNumber}`, values: [[value]] })
    } else {
      newRows.push([key, value])
    }
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_ID,
      requestBody: { valueInputOption: 'RAW', data }
    })
  }
  if (newRows.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${SETTINGS_TAB}!A2:B`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows }
    })
  }

  return getSettings()
}
