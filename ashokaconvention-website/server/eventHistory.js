import { query, ensureSchema, toNullIfBlank } from './db.js'

// Append-only audit log, separate from the events table. Events holds one
// row per booking that gets updated in place; this one gets a new row for
// every create/update/delete, so nothing is ever overwritten or lost.
export async function appendHistory({ eventId, action, bookingDate, advancePayment, balance, paymentDate, customerName, customerEmail, customerMobile, fullyPaid, hall, actor }) {
  await ensureSchema()
  await query(
    `INSERT INTO event_history (event_id, action, booking_date, advance_payment, balance, payment_date, customer_name, customer_email, customer_mobile, fully_paid, changed_by, changed_date, hall)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      eventId, action, toNullIfBlank(bookingDate), toNullIfBlank(advancePayment), toNullIfBlank(balance), toNullIfBlank(paymentDate),
      customerName || '', customerEmail || '', customerMobile || '', Boolean(fullyPaid), actor, new Date().toISOString(), hall || ''
    ]
  )
}
