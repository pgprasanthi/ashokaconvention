import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  EVENT_HISTORY_TAB = 'Event History'
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const HEADER = [
  'Event ID', 'Action', 'Booking Date', 'Advance Payment', 'Balance', 'Payment Date',
  'Customer Name', 'Customer Email', 'Customer Mobile', 'Fully Paid', 'Changed By', 'Changed Date'
]

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null

// Creates the Event History tab the first time it's needed - a separate
// sheet from Events. Events holds one row per event that gets updated in
// place; this one is append-only, so every create/update/delete is
// preserved as its own row and nothing is ever overwritten.
async function ensureTab() {
  if (tabReady) return tabReady
  tabReady = (async () => {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
    const exists = data.sheets.some((s) => s.properties.title === EVENT_HISTORY_TAB)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: EVENT_HISTORY_TAB } } }] }
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${EVENT_HISTORY_TAB}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

export async function appendHistory({ eventId, action, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, actor }) {
  await ensureTab()
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENT_HISTORY_TAB}!A2:L`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        eventId, action, bookingDate || '', advancePayment || '', balance || '', paymentDate || '',
        customerName || '', customerEmail || '', customerMobile || '', fullyPaid ? 'TRUE' : 'FALSE',
        actor, new Date().toISOString()
      ]]
    }
  })
}
