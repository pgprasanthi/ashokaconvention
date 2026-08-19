import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_SHEETS_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json',
  WHATSAPP_LEADS_TAB = 'WhatsApp Leads'
} = process.env

if (!GOOGLE_SHEETS_ID) {
  throw new Error('GOOGLE_SHEETS_ID must be set (see server/.env.example)')
}

const HEADER = ['Phone', 'Name', 'First Message', 'Last Message', 'Message Count', 'Ad Source', 'Assigned To', 'Status', 'Lost Reason', 'Last Away Sent']
const LAST_COL = 'J'

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

let tabReady = null

// Strips everything but digits and keeps the last 10, so "+91 98765 43210",
// "919876543210" and "9876543210" all compare equal regardless of how a
// number was typed into a booking form vs. how WhatsApp reports it.
export function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

// Creates the WhatsApp Leads tab the first time it's needed - a separate
// sheet from Guests, since these are WhatsApp inquiries, not site sign-ins.
// Also self-heals the header row on every server start (see events.js for
// why - a stale header here previously caused values.append to misalign new
// rows into the wrong columns entirely).
async function ensureTab() {
  if (tabReady) return tabReady
  tabReady = (async () => {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_ID })
    const exists = data.sheets.some((s) => s.properties.title === WHATSAPP_LEADS_TAB)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: WHATSAPP_LEADS_TAB } } }] }
      })
    }
    const { data: headerData } = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${WHATSAPP_LEADS_TAB}!A1:${LAST_COL}1`
    })
    const currentHeader = (headerData.values || [[]])[0]
    const isCurrent = HEADER.every((col, i) => currentHeader[i] === col)
    if (!isCurrent) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${WHATSAPP_LEADS_TAB}!A1:${LAST_COL}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] }
      })
    }
  })()
  return tabReady
}

function rowToLead(row, rowNumber) {
  const [phone, name, firstMessage, lastMessage, messageCount, adSource, assignedTo, status, lostReason, lastAwaySent] = row
  return {
    rowNumber,
    phone: (phone || '').trim(),
    name: name || '',
    firstMessage: firstMessage || '',
    lastMessage: lastMessage || '',
    messageCount: Number(messageCount) || 0,
    adSource: adSource || '',
    assignedTo: (assignedTo || '').trim().toLowerCase(),
    status: status || 'open',
    lostReason: lostReason || '',
    lastAwaySent: lastAwaySent || ''
  }
}

async function fetchLeads() {
  await ensureTab()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range: `${WHATSAPP_LEADS_TAB}!A2:${LAST_COL}` })
  return (res.data.values || []).map((row, i) => rowToLead(row, i + 2)).filter((l) => l.phone)
}

export async function listLeads() {
  return fetchLeads()
}

// Bumps Last Message + Message Count on an existing lead, without creating a
// new row if the phone isn't already known. Used for both inbound customer
// messages and outbound staff replies, so Message Count reflects the whole
// back-and-forth, not just the customer's side.
async function bumpMessageCount(phone) {
  const now = new Date().toISOString()
  const leads = await fetchLeads()
  const existing = leads.find((l) => normalizePhone(l.phone) === normalizePhone(phone))
  if (!existing) return false

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${WHATSAPP_LEADS_TAB}!D${existing.rowNumber}:E${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[now, existing.messageCount + 1]] }
  })
  return true
}

// Called on every inbound WhatsApp message. Adds a new row the first time a
// phone number messages in, otherwise bumps the existing row. adSource is
// only present on the very first message of a conversation that came from a
// Click-to-WhatsApp ad. Returns { isNew } so callers (the greeting-message
// trigger) can tell first-time contacts apart from returning ones.
export async function recordLead({ phone, name, adSource }) {
  const now = new Date().toISOString()
  if (await bumpMessageCount(phone)) return { isNew: false }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${WHATSAPP_LEADS_TAB}!A2:${LAST_COL}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[phone, name || '', now, now, 1, adSource || '', '', 'open', '', '']] }
  })
  return { isNew: true }
}

const AWAY_MESSAGE_COOLDOWN_MS = 24 * 60 * 60 * 1000

// True if this number has never gotten an away message, or its last one was
// more than the cooldown window ago - keeps an active back-and-forth from
// getting the same away reply on every single message.
export async function shouldSendAwayMessage(phone) {
  const leads = await fetchLeads()
  const existing = leads.find((l) => normalizePhone(l.phone) === normalizePhone(phone))
  if (!existing || !existing.lastAwaySent) return true
  return Date.now() - new Date(existing.lastAwaySent).getTime() > AWAY_MESSAGE_COOLDOWN_MS
}

export async function markAwaySent(phone) {
  const leads = await fetchLeads()
  const existing = leads.find((l) => normalizePhone(l.phone) === normalizePhone(phone))
  if (!existing) return

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${WHATSAPP_LEADS_TAB}!${LAST_COL}${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[new Date().toISOString()]] }
  })
}

// Called on outbound staff replies (sent from the WhatsApp Business app,
// delivered to the webhook as echo events). Only counts toward an existing
// lead - an outbound-only message with no prior inbound contact doesn't
// create a phantom lead.
export async function recordOutboundMessage(phone) {
  await bumpMessageCount(phone)
}

// Staff self-assign themselves to a lead so per-staff activity can be
// measured. Whoever calls this becomes the assignee - no reassignment logic,
// first person to pick it up owns it.
export async function assignLead(phone, staffEmail) {
  const leads = await fetchLeads()
  const existing = leads.find((l) => normalizePhone(l.phone) === normalizePhone(phone))
  if (!existing) throw new Error('Lead not found')

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${WHATSAPP_LEADS_TAB}!G${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[staffEmail.toLowerCase()]] }
  })
}

// Staff mark a lead as not converting, with a required reason. This is a
// manual call - staff are expected to have already sent a proper closing
// message to the customer on WhatsApp itself as part of their process; the
// app has no visibility into that and doesn't try to verify it.
export async function markLeadLost(phone, reason) {
  const leads = await fetchLeads()
  const existing = leads.find((l) => normalizePhone(l.phone) === normalizePhone(phone))
  if (!existing) throw new Error('Lead not found')

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: `${WHATSAPP_LEADS_TAB}!H${existing.rowNumber}:I${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['lost', reason]] }
  })
}
