import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  EVENTS_TAB = 'Events'
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const HEADER = [
  'Event ID', 'Booking Date', 'Advance Payment', 'Balance', 'Payment Date',
  'Customer Name', 'Customer Email', 'Customer Mobile',
  'Created By', 'Created Date', 'Updated Date', 'Updated By'
]

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null
let sheetIdCache = null

// Creates the Events tab the first time it's needed, so no manual sheet
// setup is required. Separate from the Team/Guests tabs.
async function ensureTab() {
  if (tabReady) return tabReady
  tabReady = (async () => {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
    const exists = data.sheets.some((s) => s.properties.title === EVENTS_TAB)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: EVENTS_TAB } } }] }
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${EVENTS_TAB}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

async function getSheetId() {
  if (sheetIdCache !== null) return sheetIdCache
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
  const tab = data.sheets.find((s) => s.properties.title === EVENTS_TAB)
  sheetIdCache = tab.properties.sheetId
  return sheetIdCache
}

function rowToEvent(row, rowNumber) {
  const [eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, createdBy, createdDate, updatedDate, updatedBy] = row
  return {
    rowNumber,
    eventId: (eventId || '').trim(),
    bookingDate: bookingDate || '',
    advancePayment: advancePayment || '',
    balance: balance || '',
    paymentDate: paymentDate || '',
    customerName: customerName || '',
    customerEmail: customerEmail || '',
    customerMobile: customerMobile || '',
    createdBy: createdBy || '',
    createdDate: createdDate || '',
    updatedDate: updatedDate || '',
    updatedBy: updatedBy || ''
  }
}

function toRow(e) {
  return [
    e.eventId, e.bookingDate, e.advancePayment, e.balance, e.paymentDate,
    e.customerName, e.customerEmail, e.customerMobile,
    e.createdBy, e.createdDate, e.updatedDate, e.updatedBy
  ]
}

async function fetchEvents() {
  await ensureTab()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: `${EVENTS_TAB}!A2:L` })
  return (res.data.values || []).map((row, i) => rowToEvent(row, i + 2)).filter((e) => e.eventId)
}

export async function listEvents() {
  return fetchEvents()
}

// eventId is the linked Google Calendar event id.
export async function createEvent({ eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, actor }) {
  const now = new Date().toISOString()
  const event = {
    eventId,
    bookingDate: bookingDate || '',
    advancePayment: advancePayment || '',
    balance: balance || '',
    paymentDate: paymentDate || '',
    customerName: customerName || '',
    customerEmail: customerEmail || '',
    customerMobile: customerMobile || '',
    createdBy: actor,
    createdDate: now,
    updatedDate: now,
    updatedBy: actor
  }
  await ensureTab()
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENTS_TAB}!A2:L`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [toRow(event)] }
  })
  return event
}

export async function updateEvent(eventId, { bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, actor }) {
  const events = await fetchEvents()
  const existing = events.find((e) => e.eventId === eventId)
  if (!existing) throw new Error('Event not found')

  const merged = {
    ...existing,
    bookingDate: bookingDate ?? existing.bookingDate,
    advancePayment: advancePayment ?? existing.advancePayment,
    balance: balance ?? existing.balance,
    paymentDate: paymentDate ?? existing.paymentDate,
    customerName: customerName ?? existing.customerName,
    customerEmail: customerEmail ?? existing.customerEmail,
    customerMobile: customerMobile ?? existing.customerMobile,
    updatedDate: new Date().toISOString(),
    updatedBy: actor
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENTS_TAB}!A${existing.rowNumber}:L${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [toRow(merged)] }
  })
  return merged
}

export async function deleteEvent(eventId) {
  const events = await fetchEvents()
  const existing = events.find((e) => e.eventId === eventId)
  if (!existing) return

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
}
