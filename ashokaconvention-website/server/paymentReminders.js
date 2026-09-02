import { query, ensureSchema, toNullIfBlank } from './db.js'
import { getSettings } from './settings.js'
import { listEvents } from './events.js'
import { logMessage } from './whatsappMessages.js'
import { recordOutboundMessage } from './whatsappLeads.js'
import { sendWhatsAppMessage, isWhatsAppConfigured } from './whatsappSend.js'

// Defaults live here (not settingsRoutes.js) so the queue still renders a
// sensible message before an admin has ever opened WhatsApp Settings.
export const DEFAULT_DAYS_BEFORE = 2
export const DEFAULT_REMINDER_TEXT =
  'Dear {name}, a gentle reminder from Ashoka Convention: the balance of ₹{balance} for your event "{event}"' +
  ' at {hall} on {date} is due by {due_date}. Kindly arrange the payment at your convenience. Thank you.'

// How far back an unpaid booking keeps showing in the queue after its due
// date - long enough to chase, not so long that ancient write-offs clutter it.
const OVERDUE_FLOOR_DAYS = 120
const MAX_MESSAGE_LENGTH = 1000

function badRequest(message) {
  const err = new Error(message)
  err.code = 'BAD_REQUEST'
  return err
}

// YYYY-MM-DD in the server's local date - matches how DATE columns come back
// (see the type parser in db.js) so string comparison is a valid date order.
function todayISODate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtAmount(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v ?? '')
  return n.toLocaleString('en-IN')
}

// Booking mobiles are stored as bare 10-digit numbers; WhatsApp wants the
// country code. Handles the few other shapes a number might have been typed
// in as. Returns '' if it can't make a plausible number.
function toWhatsAppNumber(mobile) {
  const digits = (mobile || '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits.length >= 10 && digits.length <= 15 ? digits : ''
}

function renderTemplate(tpl, ev, balance) {
  return String(tpl || '')
    .replaceAll('{name}', ev.customerName || 'Customer')
    .replaceAll('{event}', ev.eventName || 'your event')
    .replaceAll('{hall}', ev.hall || '')
    .replaceAll('{date}', fmtDate(ev.bookingDate))
    .replaceAll('{due_date}', fmtDate(ev.paymentDueDate))
    .replaceAll('{balance}', fmtAmount(balance))
    .replaceAll('{amount_paid}', fmtAmount(ev.amountPaid))
    .replaceAll('{committed}', fmtAmount(ev.committedAmount))
}

function balanceOf(ev) {
  const committed = Number(ev.committedAmount)
  const paid = Number(ev.amountPaid)
  if (!Number.isFinite(committed) || !Number.isFinite(paid)) return null
  return committed - paid
}

// Most recent reminder per (event, due date), so a due date pushed out after
// a part payment starts fresh rather than showing the old "already sent".
async function latestRemindersFor(eventIds) {
  if (!eventIds.length) return new Map()
  const { rows } = await query(
    `SELECT DISTINCT ON (event_id, due_date)
       event_id, due_date, sent_by, sent_date, send_status, error
     FROM payment_reminders
     WHERE event_id = ANY($1)
     ORDER BY event_id, due_date, sent_date DESC`,
    [eventIds]
  )
  const map = new Map()
  for (const r of rows) {
    map.set(`${r.event_id}|${r.due_date || ''}`, {
      sentBy: r.sent_by,
      sentDate: r.sent_date ? r.sent_date.toISOString() : '',
      sendStatus: r.send_status,
      error: r.error
    })
  }
  return map
}

// The live queue: non-deleted, not-fully-paid bookings with a positive
// balance whose payment_due_date is within `daysBefore` days - or already
// past (up to OVERDUE_FLOOR_DAYS ago).
export async function listDueReminders() {
  await ensureSchema()
  const settings = await getSettings()
  const daysBefore = parseInt(settings.payment_reminder_days_before, 10) || DEFAULT_DAYS_BEFORE
  const template = settings.payment_reminder_text || DEFAULT_REMINDER_TEXT

  const today = todayISODate()
  const upperBound = addDays(today, daysBefore)
  const lowerBound = addDays(today, -OVERDUE_FLOOR_DAYS)

  const events = await listEvents()
  const candidates = events.filter((e) => {
    if (e.fullyPaid || !e.paymentDueDate) return false
    const bal = balanceOf(e)
    if (bal === null || bal <= 0) return false
    return e.paymentDueDate >= lowerBound && e.paymentDueDate <= upperBound
  })

  const reminders = await latestRemindersFor(candidates.map((e) => e.eventId))

  return {
    daysBefore,
    items: candidates
      .map((e) => {
        const balance = balanceOf(e)
        return {
          eventId: e.eventId,
          customerName: e.customerName,
          customerMobile: e.customerMobile,
          hall: e.hall,
          eventName: e.eventName,
          bookingDate: e.bookingDate,
          paymentDueDate: e.paymentDueDate,
          committedAmount: e.committedAmount,
          amountPaid: e.amountPaid,
          balance: String(balance),
          overdue: e.paymentDueDate < today,
          message: renderTemplate(template, e, balance),
          lastReminder: reminders.get(`${e.eventId}|${e.paymentDueDate}`) || null
        }
      })
      .sort((a, b) => a.paymentDueDate.localeCompare(b.paymentDueDate))
  }
}

// Sends one reminder. `message` is the (possibly staff-edited) final text
// from the queue. A WhatsApp rejection (e.g. the customer is outside the
// 24-hour window and this isn't a template message) is recorded as a
// 'failed' row and returned as `error` rather than thrown, so the row in the
// UI can show why.
export async function sendReminder(eventId, { message, actor }) {
  await ensureSchema()

  const finalText = String(message || '').trim()
  if (!finalText) throw badRequest('Message text is required')
  if (finalText.length > MAX_MESSAGE_LENGTH) throw badRequest('Message is too long')

  const { rows } = await query('SELECT * FROM events WHERE event_id = $1', [eventId])
  const row = rows[0]
  if (!row) throw badRequest('Booking not found')
  if (row.deleted) throw badRequest('Booking is cancelled')
  if (row.fully_paid) throw badRequest('Booking is already fully paid')

  const ev = {
    customerMobile: row.customer_mobile,
    committedAmount: row.committed_amount ?? '',
    amountPaid: row.amount_paid ?? '',
    paymentDueDate: row.payment_due_date || ''
  }
  const balance = balanceOf(ev)
  if (balance === null || balance <= 0) throw badRequest('No balance is due on this booking')

  const waNumber = toWhatsAppNumber(ev.customerMobile)
  if (!waNumber) throw badRequest('Customer mobile number is missing or invalid')

  let sendStatus = 'sent'
  let error = ''
  try {
    await sendWhatsAppMessage(waNumber, finalText)
    if (!isWhatsAppConfigured()) sendStatus = 'skipped'
  } catch (err) {
    sendStatus = 'failed'
    error = err.message
  }

  if (sendStatus !== 'failed') {
    await logMessage(waNumber, 'out', finalText)
    await recordOutboundMessage(waNumber).catch(() => {})
  }

  await query(
    `INSERT INTO payment_reminders (event_id, due_date, balance_at_send, phone, message, sent_by, send_status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [eventId, toNullIfBlank(ev.paymentDueDate), balance, waNumber, finalText, actor, sendStatus, error]
  )

  return { ...(await listDueReminders()), sendStatus, error }
}
