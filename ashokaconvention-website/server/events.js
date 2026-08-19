import { query, ensureSchema, toNullIfBlank, dateToISODate, dateToISOString } from './db.js'
import { appendHistory } from './eventHistory.js'

function rowToEvent(row) {
  return {
    eventId: row.event_id,
    bookingDate: dateToISODate(row.booking_date),
    advancePayment: row.advance_payment ?? '',
    balance: row.balance ?? '',
    paymentDate: dateToISODate(row.payment_date),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerMobile: row.customer_mobile,
    fullyPaid: row.fully_paid,
    createdBy: row.created_by,
    createdDate: dateToISOString(row.created_date),
    updatedDate: dateToISOString(row.updated_date),
    updatedBy: row.updated_by,
    deleted: row.deleted,
    hall: row.hall
  }
}

async function fetchEvents() {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM events ORDER BY created_date ASC')
  return rows.map(rowToEvent)
}

export async function listEvents() {
  const events = await fetchEvents()
  return events.filter((e) => !e.deleted)
}

// eventId is the linked Google Calendar event id.
export async function createEvent({ eventId, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, hall, actor }) {
  await ensureSchema()
  const now = new Date().toISOString()
  await query(
    `INSERT INTO events (event_id, booking_date, advance_payment, balance, payment_date, customer_name, customer_email, customer_mobile, fully_paid, created_by, created_date, updated_date, updated_by, deleted, hall)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $10, FALSE, $12)`,
    [
      eventId, toNullIfBlank(bookingDate), toNullIfBlank(advancePayment), toNullIfBlank(balance), toNullIfBlank(paymentDate),
      customerName || '', customerEmail || '', customerMobile || '', Boolean(fullyPaid), actor, now, hall || ''
    ]
  )
  const event = {
    eventId, bookingDate: bookingDate || '', advancePayment: advancePayment || '', balance: balance || '', paymentDate: paymentDate || '',
    customerName: customerName || '', customerEmail: customerEmail || '', customerMobile: customerMobile || '', fullyPaid: Boolean(fullyPaid),
    createdBy: actor, createdDate: now, updatedDate: now, updatedBy: actor, deleted: false, hall: hall || ''
  }
  await appendHistory({ ...event, action: 'created', actor })
  return event
}

// Once an event is saved with fullyPaid, its payment fields (advance,
// balance, payment date, and the flag itself) are locked - a caller can
// still update booking/customer details, but payment changes are silently
// ignored rather than applied, enforced here so it can't be bypassed by
// calling the API directly.
export async function updateEvent(eventId, { bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, hall, actor }) {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM events WHERE event_id = $1', [eventId])
  if (!rows[0]) throw new Error('Event not found')
  const existing = rowToEvent(rows[0])

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
    hall: hall ?? existing.hall,
    updatedDate: new Date().toISOString(),
    updatedBy: actor
  }
  await query(
    `UPDATE events SET booking_date = $1, advance_payment = $2, balance = $3, payment_date = $4, customer_name = $5,
       customer_email = $6, customer_mobile = $7, fully_paid = $8, updated_date = $9, updated_by = $10, hall = $11
     WHERE event_id = $12`,
    [
      toNullIfBlank(merged.bookingDate), toNullIfBlank(merged.advancePayment), toNullIfBlank(merged.balance), toNullIfBlank(merged.paymentDate),
      merged.customerName, merged.customerEmail, merged.customerMobile, merged.fullyPaid, merged.updatedDate, merged.updatedBy, merged.hall, eventId
    ]
  )
  await appendHistory({ ...merged, action: 'updated', actor })
  return merged
}

// Soft delete: the row stays in the database forever with deleted=TRUE
// rather than being removed, so payment/customer history is never lost. The
// Google Calendar event itself is still actually deleted (by the caller,
// via bookings.js) so the calendar slot frees up.
export async function deleteEvent(eventId, actor) {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM events WHERE event_id = $1', [eventId])
  if (!rows[0]) return
  const existing = rowToEvent(rows[0])

  const updatedDate = new Date().toISOString()
  await query('UPDATE events SET deleted = TRUE, updated_date = $1, updated_by = $2 WHERE event_id = $3', [updatedDate, actor, eventId])

  const merged = { ...existing, deleted: true, updatedDate, updatedBy: actor }
  await appendHistory({ ...merged, action: 'deleted', actor })
}
