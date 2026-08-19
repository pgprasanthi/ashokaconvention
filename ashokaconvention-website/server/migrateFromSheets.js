// One-time migration: copies existing data from Google Sheets into Postgres.
// Read-only against Sheets - nothing there is modified or deleted, so this
// is safe to run more than once (every insert is guarded against
// duplicates) while double-checking the results.
//
// Usage: node migrateFromSheets.js
import 'dotenv/config'
import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { query, ensureSchema, toNullIfBlank } from './db.js'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  TEAM_RANGE = 'Sheet1!A2:E',
  GUESTS_TAB = 'Guests',
  EVENTS_TAB = 'Events',
  EVENT_HISTORY_TAB = 'Event History',
  WHATSAPP_LEADS_TAB = 'WhatsApp Leads',
  SETTINGS_TAB = 'Settings'
} = process.env

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })

async function readTab(range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range })
    return res.data.values || []
  } catch (err) {
    console.warn(`Could not read "${range}" (tab may not exist yet) - skipping:`, err.message)
    return []
  }
}

async function migrateTeam() {
  const rows = await readTab(TEAM_RANGE)
  let inserted = 0
  for (const [email, role, name, joinedOn, mobile] of rows) {
    if (!email) continue
    const { rowCount } = await query(
      'INSERT INTO team_members (email, role, name, joined_on, mobile) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING',
      [email.trim().toLowerCase(), (role || 'guest').trim().toLowerCase(), (name || '').trim(), (joinedOn || '').trim(), (mobile || '').trim()]
    )
    inserted += rowCount
  }
  console.log(`Team: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function migrateGuests() {
  const rows = await readTab(`${GUESTS_TAB}!A2:D`)
  let inserted = 0
  for (const [email, name, firstSeen, lastSeen] of rows) {
    if (!email) continue
    const { rowCount } = await query(
      'INSERT INTO guests (email, name, first_seen, last_seen) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
      [email.trim().toLowerCase(), name || '', toNullIfBlank(firstSeen), toNullIfBlank(lastSeen)]
    )
    inserted += rowCount
  }
  console.log(`Guests: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function migrateEvents() {
  const rows = await readTab(`${EVENTS_TAB}!A2:O`)
  let inserted = 0
  for (const row of rows) {
    const [eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, createdBy, createdDate, updatedDate, updatedBy, deleted, hall] = row
    if (!eventId) continue
    const { rowCount } = await query(
      `INSERT INTO events (event_id, booking_date, advance_payment, balance, payment_date, customer_name, customer_email, customer_mobile, fully_paid, created_by, created_date, updated_date, updated_by, deleted, hall)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        eventId.trim(), toNullIfBlank(bookingDate), toNullIfBlank(advancePayment), toNullIfBlank(balance), toNullIfBlank(paymentDate),
        customerName || '', customerEmail || '', customerMobile || '', fullyPaid === true || fullyPaid === 'TRUE',
        createdBy || '', toNullIfBlank(createdDate), toNullIfBlank(updatedDate), updatedBy || '',
        deleted === true || deleted === 'TRUE', hall || ''
      ]
    )
    inserted += rowCount
  }
  console.log(`Events: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function migrateEventHistory() {
  const rows = await readTab(`${EVENT_HISTORY_TAB}!A2:M`)
  let inserted = 0
  for (const row of rows) {
    const [eventId, action, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, changedBy, changedDate, hall] = row
    if (!eventId) continue
    // No natural unique key for an append-only log - guard against re-running
    // this script twice by checking whether this exact (event_id, changed_date)
    // pair is already present before inserting.
    const { rows: existing } = await query('SELECT 1 FROM event_history WHERE event_id = $1 AND changed_date = $2', [eventId.trim(), toNullIfBlank(changedDate)])
    if (existing.length) continue

    await query(
      `INSERT INTO event_history (event_id, action, booking_date, advance_payment, balance, payment_date, customer_name, customer_email, customer_mobile, fully_paid, changed_by, changed_date, hall)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        eventId.trim(), action || '', toNullIfBlank(bookingDate), toNullIfBlank(advancePayment), toNullIfBlank(balance), toNullIfBlank(paymentDate),
        customerName || '', customerEmail || '', customerMobile || '', fullyPaid === true || fullyPaid === 'TRUE',
        changedBy || '', toNullIfBlank(changedDate), hall || ''
      ]
    )
    inserted += 1
  }
  console.log(`Event History: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function migrateWhatsAppLeads() {
  const rows = await readTab(`${WHATSAPP_LEADS_TAB}!A2:J`)
  let inserted = 0
  for (const row of rows) {
    const [phone, name, firstMessage, lastMessage, messageCount, adSource, assignedTo, status, lostReason, lastAwaySent] = row
    if (!phone) continue
    const { rowCount } = await query(
      `INSERT INTO whatsapp_leads (phone, name, first_message, last_message, message_count, ad_source, assigned_to, status, lost_reason, last_away_sent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (phone) DO NOTHING`,
      [
        phone.trim(), name || '', toNullIfBlank(firstMessage), toNullIfBlank(lastMessage), Number(messageCount) || 0,
        adSource || '', (assignedTo || '').trim().toLowerCase(), status || 'open', lostReason || '', toNullIfBlank(lastAwaySent)
      ]
    )
    inserted += rowCount
  }
  console.log(`WhatsApp Leads: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function migrateSettings() {
  const rows = await readTab(`${SETTINGS_TAB}!A2:B`)
  let inserted = 0
  for (const [key, value] of rows) {
    if (!key) continue
    const { rowCount } = await query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key.trim(), value ?? '']
    )
    inserted += rowCount
  }
  console.log(`Settings: ${rows.length} rows in sheet, ${inserted} newly inserted`)
}

async function main() {
  await ensureSchema()
  await migrateTeam()
  await migrateGuests()
  await migrateEvents()
  await migrateEventHistory()
  await migrateWhatsAppLeads()
  await migrateSettings()
  console.log('Migration complete. Google Sheets data was not modified.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
