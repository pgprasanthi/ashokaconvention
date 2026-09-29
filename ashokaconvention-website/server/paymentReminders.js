import { query, ensureSchema, toNullIfBlank } from './db.js'
import { getSettings } from './settings.js'
import { listEvents } from './events.js'
import { paymentTypeLabel } from './paymentTypes.js'
import { logMessage } from './whatsappMessages.js'
import { recordOutboundMessage } from './whatsappLeads.js'
import { sendWhatsAppMessage, isWhatsAppConfigured } from './whatsappSend.js'

// Defaults live here (not settingsRoutes.js) so the queue still renders a
// sensible message before an admin has ever opened WhatsApp Settings.
export const DEFAULT_DAYS_BEFORE = 2
export const DEFAULT_REMINDER_TEXT =
  'Dear {name}, a gentle reminder from Ashoka Convention: the {payment_type} balance of ₹{balance} for your event "{event}"' +
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

// A payment's own label (set for 'other' charges - "DJ", "Photography", ...)
// takes priority over the generic type label, since that's what actually
// tells apart several 'other' charges on the same booking.
function displayLabel(payment) {
  return payment.label || paymentTypeLabel(payment.paymentType)
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

function renderTemplate(tpl, ev, payment, balance) {
  return String(tpl || '')
    .replaceAll('{name}', ev.customerName || 'Customer')
    .replaceAll('{event}', ev.eventName || 'your event')
    .replaceAll('{hall}', ev.hall || '')
    .replaceAll('{date}', fmtDate(ev.bookingDate))
    .replaceAll('{payment_type}', displayLabel(payment))
    .replaceAll('{due_date}', fmtDate(payment.paymentDueDate))
    .replaceAll('{balance}', fmtAmount(balance))
    .replaceAll('{amount_paid}', fmtAmount(payment.amountPaid))
    .replaceAll('{committed}', fmtAmount(payment.committedAmount))
}

function balanceOf(payment) {
  const committed = Number(payment.committedAmount)
  const paid = Number(payment.amountPaid)
  if (!Number.isFinite(committed) || !Number.isFinite(paid)) return null
  return committed - paid
}

// Most recent reminder per (payment, due date), so a due date pushed out
// after a part payment starts fresh rather than showing the old "already
// sent". Keyed by payment_id, not payment_type - 'other' can have several
// rows on the same event, so the type alone no longer identifies one.
async function latestRemindersFor(paymentIds) {
  if (!paymentIds.length) return new Map()
  const { rows } = await query(
    `SELECT DISTINCT ON (payment_id, due_date)
       payment_id, due_date, sent_by, sent_date, send_status, error
     FROM payment_reminders
     WHERE payment_id = ANY($1)
     ORDER BY payment_id, due_date, sent_date DESC`,
    [paymentIds]
  )
  const map = new Map()
  for (const r of rows) {
    map.set(`${r.payment_id}|${r.due_date || ''}`, {
      sentBy: r.sent_by,
      sentDate: r.sent_date ? r.sent_date.toISOString() : '',
      sendStatus: r.send_status,
      error: r.error
    })
  }
  return map
}

// The live queue: one item per payment line item that's non-deleted, not
// fully paid, has a positive balance, and whose payment_due_date is within
// `daysBefore` days - or already past (up to OVERDUE_FLOOR_DAYS ago).
export async function listDueReminders() {
  await ensureSchema()
  const settings = await getSettings()
  const daysBefore = parseInt(settings.payment_reminder_days_before, 10) || DEFAULT_DAYS_BEFORE
  const template = settings.payment_reminder_text || DEFAULT_REMINDER_TEXT

  const today = todayISODate()
  const upperBound = addDays(today, daysBefore)
  const lowerBound = addDays(today, -OVERDUE_FLOOR_DAYS)

  const events = await listEvents()
  const candidates = []
  for (const e of events) {
    for (const p of e.payments) {
      if (p.fullyPaid || !p.paymentDueDate) continue
      const bal = balanceOf(p)
      if (bal === null || bal <= 0) continue
      if (p.paymentDueDate < lowerBound || p.paymentDueDate > upperBound) continue
      candidates.push({ event: e, payment: p })
    }
  }

  const reminders = await latestRemindersFor(candidates.map((c) => c.payment.id))

  return {
    daysBefore,
    items: candidates
      .map(({ event: e, payment: p }) => {
        const balance = balanceOf(p)
        return {
          eventId: e.eventId,
          paymentId: p.id,
          paymentType: p.paymentType,
          paymentTypeLabel: displayLabel(p),
          customerName: e.customerName,
          customerMobile: e.customerMobile,
          hall: e.hall,
          eventName: e.eventName,
          bookingDate: e.bookingDate,
          paymentDueDate: p.paymentDueDate,
          committedAmount: p.committedAmount,
          amountPaid: p.amountPaid,
          balance: String(balance),
          overdue: p.paymentDueDate < today,
          message: renderTemplate(template, e, p, balance),
          lastReminder: reminders.get(`${p.id}|${p.paymentDueDate}`) || null
        }
      })
      .sort((a, b) => a.paymentDueDate.localeCompare(b.paymentDueDate))
  }
}

// Sends one reminder for one payment line item (identified by its own id,
// not type - 'other' can have several on the same event). `message` is the
// (possibly staff-edited) final text from the queue. A WhatsApp rejection
// (e.g. the customer is outside the 24-hour window and this isn't a
// template message) is recorded as a 'failed' row and returned as `error`
// rather than thrown, so the row in the UI can show why.
export async function sendReminder(eventId, paymentId, { message, actor }) {
  await ensureSchema()

  const finalText = String(message || '').trim()
  if (!finalText) throw badRequest('Message text is required')
  if (finalText.length > MAX_MESSAGE_LENGTH) throw badRequest('Message is too long')

  const { rows } = await query(
    `SELECT e.deleted, c.mobile AS customer_mobile, p.payment_type, p.label,
            p.committed_amount, p.amount_paid, p.payment_due_date, p.fully_paid
     FROM events e
     JOIN customers c ON c.id = e.customer_id
     JOIN payments p ON p.event_id = e.event_id AND p.id = $2
     WHERE e.event_id = $1`,
    [eventId, paymentId]
  )
  const row = rows[0]
  if (!row) throw badRequest('Booking or payment not found')
  if (row.deleted) throw badRequest('Booking is cancelled')
  if (row.fully_paid) throw badRequest('This payment is already fully paid')

  const payment = {
    paymentType: row.payment_type,
    label: row.label,
    committedAmount: row.committed_amount ?? '',
    amountPaid: row.amount_paid ?? '',
    paymentDueDate: row.payment_due_date || ''
  }
  const balance = balanceOf(payment)
  if (balance === null || balance <= 0) throw badRequest('No balance is due on this payment')

  const waNumber = toWhatsAppNumber(row.customer_mobile)
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
    `INSERT INTO payment_reminders (event_id, payment_id, payment_type, due_date, balance_at_send, phone, message, sent_by, send_status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [eventId, paymentId, payment.paymentType, toNullIfBlank(payment.paymentDueDate), balance, waNumber, finalText, actor, sendStatus, error]
  )

  return { ...(await listDueReminders()), sendStatus, error }
}
