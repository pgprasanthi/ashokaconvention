import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { appendHistory } from './eventHistory.js'

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
  'Customer Name', 'Customer Email', 'Customer Mobile', 'Fully Paid',
  'Created By', 'Created Date', 'Updated Date', 'Updated By', 'Deleted'
]

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null

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
        range: `${EVENTS_TAB}!A1:N1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

function rowToEvent(row, rowNumber) {
  const [eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, createdBy, createdDate, updatedDate, updatedBy, deleted] = row
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
    fullyPaid: fullyPaid === true || fullyPaid === 'TRUE',
    createdBy: createdBy || '',
    createdDate: createdDate || '',
    updatedDate: updatedDate || '',
    updatedBy: updatedBy || '',
    deleted: deleted === true || deleted === 'TRUE'
  }
}

function toRow(e) {
  return [
    e.eventId, e.bookingDate, e.advancePayment, e.balance, e.paymentDate,
    e.customerName, e.customerEmail, e.customerMobile, e.fullyPaid ? 'TRUE' : 'FALSE',
    e.createdBy, e.createdDate, e.updatedDate, e.updatedBy, e.deleted ? 'TRUE' : 'FALSE'
  ]
}

async function fetchEvents() {
  await ensureTab()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: `${EVENTS_TAB}!A2:N` })
  return (res.data.values || []).map((row, i) => rowToEvent(row, i + 2)).filter((e) => e.eventId)
}

export async function listEvents() {
  const events = await fetchEvents()
  return events.filter((e) => !e.deleted)
}

// eventId is the linked Google Calendar event id.
export async function createEvent({ eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, actor }) {
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
    fullyPaid: Boolean(fullyPaid),
    createdBy: actor,
    createdDate: now,
    updatedDate: now,
    updatedBy: actor,
    deleted: false
  }
  await ensureTab()
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENTS_TAB}!A2:N`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [toRow(event)] }
  })
  await appendHistory({ ...event, action: 'created', actor })
  return event
}

// Once an event is saved with fullyPaid, its payment fields (advance,
// balance, payment date, and the flag itself) are locked - a caller can
// still update booking/customer details, but payment changes are silently
// ignored rather than applied, enforced here so it can't be bypassed by
// calling the API directly.
export async function updateEvent(eventId, { bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, actor }) {
  const events = await fetchEvents()
  const existing = events.find((e) => e.eventId === eventId)
  if (!existing) throw new Error('Event not found')

  const paymentLocked = existing.fullyPaid
  const merged = {
    ...existing,
    bookingDate: bookingDate ?? existing.bookingDate,
    advancePayment: paymentLocked ? existing.advancePayment : (advancePayment ?? existing.advancePayment),
    balance: paymentLocked ? existing.balance : (balance ?? existing.balance),
    paymentDate: paymentLocked ? existing.paymentDate : (paymentDate ?? existing.paymentDate),
    fullyPaid: paymentLocked ? existing.fullyPaid : Boolean(fullyPaid),
    customerName: customerName ?? existing.customerName,
    customerEmail: customerEmail ?? existing.customerEmail,
    customerMobile: customerMobile ?? existing.customerMobile,
    updatedDate: new Date().toISOString(),
    updatedBy: actor
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENTS_TAB}!A${existing.rowNumber}:N${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [toRow(merged)] }
  })
  await appendHistory({ ...merged, action: 'updated', actor })
  return merged
}

// Soft delete: the row stays in the sheet forever with Deleted=TRUE rather
// than being removed, so payment/customer history is never lost. The
// Google Calendar event itself is still actually deleted (by the caller,
// via bookings.js) so the calendar slot frees up.
export async function deleteEvent(eventId, actor) {
  const events = await fetchEvents()
  const existing = events.find((e) => e.eventId === eventId)
  if (!existing) return

  const merged = { ...existing, deleted: true, updatedDate: new Date().toISOString(), updatedBy: actor }
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${EVENTS_TAB}!A${existing.rowNumber}:N${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [toRow(merged)] }
  })
  await appendHistory({ ...merged, action: 'deleted', actor })
}
