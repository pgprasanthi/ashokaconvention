import { query, ensureSchema, toNullIfBlank } from './db.js'

// Append-only audit log, separate from the events table. Events holds one
// row per booking that gets updated in place; this one gets a new row for
// every create/update/delete, and one more per payment type touched in the
// same action, so nothing is ever overwritten or lost. paymentType is blank
// for a row that only records an event/customer edit, no payment change.
export async function appendHistory({
  eventId, action, bookingDate, paymentType, amountPaid, balance, paymentDate, customerName, customerEmail, customerMobile, customerAddress,
  fullyPaid, hall, eventName, eventType, referredBy, committedAmount, closedBy, guestCount, paymentDueDate, cancellationReason, notes, actor
}) {
  await ensureSchema()
  await query(
    `INSERT INTO event_history (
       event_id, action, booking_date, payment_type, amount_paid, balance, payment_date, customer_name, customer_email, customer_mobile, customer_address,
       fully_paid, changed_by, changed_date, hall, event_name, event_type, referred_by, committed_amount, closed_by, guest_count, payment_due_date, cancellation_reason, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      eventId, action, toNullIfBlank(bookingDate), paymentType || '', toNullIfBlank(amountPaid), toNullIfBlank(balance), toNullIfBlank(paymentDate),
      customerName || '', customerEmail || '', customerMobile || '', customerAddress || '', Boolean(fullyPaid), actor, new Date().toISOString(), hall || '',
      eventName || '', eventType || '', referredBy || '', toNullIfBlank(committedAmount), closedBy || '', toNullIfBlank(guestCount), toNullIfBlank(paymentDueDate),
      cancellationReason || '', notes || ''
    ]
  )
}
