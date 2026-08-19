import { query, ensureSchema, dateToISOString } from './db.js'

// Strips everything but digits and keeps the last 10, so "+91 98765 43210",
// "919876543210" and "9876543210" all compare equal regardless of how a
// number was typed into a booking form vs. how WhatsApp reports it.
export function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

function rowToLead(row) {
  return {
    phone: row.phone,
    name: row.name,
    firstMessage: dateToISOString(row.first_message),
    lastMessage: dateToISOString(row.last_message),
    messageCount: row.message_count,
    adSource: row.ad_source,
    assignedTo: row.assigned_to,
    status: row.status,
    lostReason: row.lost_reason,
    lastAwaySent: dateToISOString(row.last_away_sent)
  }
}

export async function listLeads() {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM whatsapp_leads ORDER BY id ASC')
  return rows.map(rowToLead)
}

// Bumps Last Message + Message Count on an existing lead, without creating a
// new row if the phone isn't already known. Used for both inbound customer
// messages and outbound staff replies, so Message Count reflects the whole
// back-and-forth, not just the customer's side.
async function bumpMessageCount(phone) {
  await ensureSchema()
  const now = new Date().toISOString()
  const { rowCount } = await query(
    `UPDATE whatsapp_leads SET last_message = $1, message_count = message_count + 1
     WHERE phone IN (SELECT phone FROM whatsapp_leads WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10))`,
    [now, phone]
  )
  return rowCount > 0
}

// Called on every inbound WhatsApp message. Adds a new row the first time a
// phone number messages in, otherwise bumps the existing row. adSource is
// only present on the very first message of a conversation that came from a
// Click-to-WhatsApp ad. Returns { isNew } so callers (the greeting-message
// trigger) can tell first-time contacts apart from returning ones.
export async function recordLead({ phone, name, adSource }) {
  await ensureSchema()
  if (await bumpMessageCount(phone)) return { isNew: false }

  const now = new Date().toISOString()
  await query(
    `INSERT INTO whatsapp_leads (phone, name, first_message, last_message, message_count, ad_source, assigned_to, status, lost_reason)
     VALUES ($1, $2, $3, $3, 1, $4, '', 'open', '')`,
    [phone, name || '', now, adSource || '']
  )
  return { isNew: true }
}

const AWAY_MESSAGE_COOLDOWN_MS = 24 * 60 * 60 * 1000

async function findByPhone(phone) {
  const { rows } = await query(
    `SELECT * FROM whatsapp_leads WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10)`,
    [phone]
  )
  return rows[0] ? rowToLead(rows[0]) : null
}

// True if this number has never gotten an away message, or its last one was
// more than the cooldown window ago - keeps an active back-and-forth from
// getting the same away reply on every single message.
export async function shouldSendAwayMessage(phone) {
  await ensureSchema()
  const existing = await findByPhone(phone)
  if (!existing || !existing.lastAwaySent) return true
  return Date.now() - new Date(existing.lastAwaySent).getTime() > AWAY_MESSAGE_COOLDOWN_MS
}

export async function markAwaySent(phone) {
  await ensureSchema()
  await query(
    `UPDATE whatsapp_leads SET last_away_sent = $1
     WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10)`,
    [new Date().toISOString(), phone]
  )
}

// Called on outbound staff replies (sent from the WhatsApp Business app,
// delivered to the webhook as echo events). Only counts toward an existing
// lead - an outbound-only message with no prior inbound contact doesn't
// create a phantom lead.
export async function recordOutboundMessage(phone) {
  await ensureSchema()
  await bumpMessageCount(phone)
}

// Staff self-assign themselves to a lead so per-staff activity can be
// measured. Whoever calls this becomes the assignee - no reassignment logic,
// first person to pick it up owns it.
export async function assignLead(phone, staffEmail) {
  await ensureSchema()
  const existing = await findByPhone(phone)
  if (!existing) throw new Error('Lead not found')

  await query(
    `UPDATE whatsapp_leads SET assigned_to = $1
     WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10)`,
    [staffEmail.toLowerCase(), phone]
  )
}

// Staff mark a lead as not converting, with a required reason. This is a
// manual call - staff are expected to have already sent a proper closing
// message to the customer on WhatsApp itself as part of their process; the
// app has no visibility into that and doesn't try to verify it.
export async function markLeadLost(phone, reason) {
  await ensureSchema()
  const existing = await findByPhone(phone)
  if (!existing) throw new Error('Lead not found')

  await query(
    `UPDATE whatsapp_leads SET status = 'lost', lost_reason = $1
     WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10)`,
    [reason, phone]
  )
}
