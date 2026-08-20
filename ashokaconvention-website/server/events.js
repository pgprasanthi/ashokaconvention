import { query, ensureSchema, toNullIfBlank, dateToISODate, dateToISOString } from './db.js'
import { appendHistory } from './eventHistory.js'

// Postgres error code 23505 = unique_violation. Translates the DB-level
// constraint error (customer mobile + hall + booking date already booked)
// into something bookingRoutes.js already knows how to surface as a 409,
// same as the Calendar hall-conflict check.
function duplicateBookingError(err) {
  if (err.code !== '23505' || err.constraint !== 'events_mobile_hall_date_unique') return err
  const dupError = new Error('This customer already has a booking for this hall on this date')
  dupError.code = 'CONFLICT'
  return dupError
}

// Balance is always derived, never entered directly - keeps it impossible
// for the two to drift out of sync regardless of how a request is made
// (UI, or a direct API call). Blank if either side of the sum is unknown.
function computeBalance(committedAmount, amountPaid) {
  const committed = Number(committedAmount)
  const paid = Number(amountPaid)
  if (!Number.isFinite(committed) || !Number.isFinite(paid)) return ''
  return String(committed - paid)
}

// fullyPaid is likewise derived, not a manually-set flag - it's true exactly
// when the balance hits zero, never toggled directly by a caller.
function computeFullyPaid(committedAmount, amountPaid) {
  const balance = computeBalance(committedAmount, amountPaid)
  return balance !== '' && Number(balance) === 0
}

function rowToEvent(row) {
  return {
    eventId: row.event_id,
    bookingDate: dateToISODate(row.booking_date),
    amountPaid: row.amount_paid ?? '',
    balance: row.balance ?? '',
    paymentDate: dateToISODate(row.payment_date),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerMobile: row.customer_mobile,
    customerAddress: row.customer_address,
    fullyPaid: row.fully_paid,
    createdBy: row.created_by,
    createdDate: dateToISOString(row.created_date),
    updatedDate: dateToISOString(row.updated_date),
    updatedBy: row.updated_by,
    deleted: row.deleted,
    hall: row.hall,
    eventName: row.event_name,
    eventType: row.event_type,
    referredBy: row.referred_by,
    committedAmount: row.committed_amount ?? '',
    closedBy: row.closed_by,
    guestCount: row.guest_count ?? '',
    paymentDueDate: dateToISODate(row.payment_due_date),
    cancellationReason: row.cancellation_reason,
    notes: row.notes
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
export async function createEvent({
  eventId, bookingDate, amountPaid, paymentDate, customerName, customerEmail, customerMobile, customerAddress,
  hall, eventName, eventType, referredBy, committedAmount, closedBy, guestCount, paymentDueDate, notes, actor
}) {
  await ensureSchema()
  const now = new Date().toISOString()
  const balance = computeBalance(committedAmount, amountPaid)
  const fullyPaid = computeFullyPaid(committedAmount, amountPaid)
  try {
    await query(
      `INSERT INTO events (
         event_id, booking_date, amount_paid, balance, payment_date, customer_name, customer_email, customer_mobile, customer_address,
         fully_paid, created_by, created_date, updated_date, updated_by, deleted, hall,
         event_name, event_type, referred_by, committed_amount, closed_by, guest_count, payment_due_date, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $11, FALSE, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        eventId, toNullIfBlank(bookingDate), toNullIfBlank(amountPaid), toNullIfBlank(balance), toNullIfBlank(paymentDate),
        customerName || '', customerEmail || '', customerMobile || '', customerAddress || '', Boolean(fullyPaid), actor, now, hall || '',
        eventName || '', eventType || '', referredBy || '', toNullIfBlank(committedAmount), closedBy || '', toNullIfBlank(guestCount), toNullIfBlank(paymentDueDate), notes || ''
      ]
    )
  } catch (err) {
    throw duplicateBookingError(err)
  }
  const event = {
    eventId, bookingDate: bookingDate || '', amountPaid: amountPaid || '', balance, paymentDate: paymentDate || '',
    customerName: customerName || '', customerEmail: customerEmail || '', customerMobile: customerMobile || '', customerAddress: customerAddress || '',
    fullyPaid: Boolean(fullyPaid), createdBy: actor, createdDate: now, updatedDate: now, updatedBy: actor, deleted: false, hall: hall || '',
    eventName: eventName || '', eventType: eventType || '', referredBy: referredBy || '', committedAmount: committedAmount || '', closedBy: closedBy || '',
    guestCount: guestCount || '', paymentDueDate: paymentDueDate || '', cancellationReason: '', notes: notes || ''
  }
  await appendHistory({ ...event, action: 'created', actor })
  return event
}

// Once an event is saved with fullyPaid, its payment fields (amount paid,
// balance, payment date, committed amount, payment due date, and the flag
// itself) are locked - a caller can still update booking/customer details,
// but payment changes are silently ignored rather than applied, enforced
// here so it can't be bypassed by calling the API directly.
export async function updateEvent(eventId, {
  bookingDate, amountPaid, paymentDate, customerName, customerEmail, customerMobile, customerAddress,
  hall, eventName, eventType, referredBy, committedAmount, closedBy, guestCount, paymentDueDate, notes, actor
}) {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM events WHERE event_id = $1', [eventId])
  if (!rows[0]) throw new Error('Event not found')
  const existing = rowToEvent(rows[0])

  const paymentLocked = existing.fullyPaid
  const mergedAmountPaid = paymentLocked ? existing.amountPaid : (amountPaid ?? existing.amountPaid)
  const mergedCommittedAmount = paymentLocked ? existing.committedAmount : (committedAmount ?? existing.committedAmount)
  const merged = {
    ...existing,
    bookingDate: bookingDate ?? existing.bookingDate,
    amountPaid: mergedAmountPaid,
    balance: paymentLocked ? existing.balance : computeBalance(mergedCommittedAmount, mergedAmountPaid),
    paymentDate: paymentLocked ? existing.paymentDate : (paymentDate ?? existing.paymentDate),
    fullyPaid: paymentLocked ? existing.fullyPaid : computeFullyPaid(mergedCommittedAmount, mergedAmountPaid),
    committedAmount: mergedCommittedAmount,
    paymentDueDate: paymentLocked ? existing.paymentDueDate : (paymentDueDate ?? existing.paymentDueDate),
    customerName: customerName ?? existing.customerName,
    customerEmail: customerEmail ?? existing.customerEmail,
    customerMobile: customerMobile ?? existing.customerMobile,
    customerAddress: customerAddress ?? existing.customerAddress,
    hall: hall ?? existing.hall,
    eventName: eventName ?? existing.eventName,
    eventType: eventType ?? existing.eventType,
    referredBy: referredBy ?? existing.referredBy,
    closedBy: closedBy ?? existing.closedBy,
    guestCount: guestCount ?? existing.guestCount,
    notes: notes ?? existing.notes,
    updatedDate: new Date().toISOString(),
    updatedBy: actor
  }
  try {
    await query(
      `UPDATE events SET booking_date = $1, amount_paid = $2, balance = $3, payment_date = $4, customer_name = $5,
         customer_email = $6, customer_mobile = $7, customer_address = $8, fully_paid = $9, updated_date = $10, updated_by = $11, hall = $12,
         event_name = $13, event_type = $14, referred_by = $15, committed_amount = $16, closed_by = $17, guest_count = $18, payment_due_date = $19, notes = $20
       WHERE event_id = $21`,
      [
        toNullIfBlank(merged.bookingDate), toNullIfBlank(merged.amountPaid), toNullIfBlank(merged.balance), toNullIfBlank(merged.paymentDate),
        merged.customerName, merged.customerEmail, merged.customerMobile, merged.customerAddress, merged.fullyPaid, merged.updatedDate, merged.updatedBy, merged.hall,
        merged.eventName, merged.eventType, merged.referredBy, toNullIfBlank(merged.committedAmount), merged.closedBy, toNullIfBlank(merged.guestCount), toNullIfBlank(merged.paymentDueDate), merged.notes,
        eventId
      ]
    )
  } catch (err) {
    throw duplicateBookingError(err)
  }
  // events.amount_paid is the running cumulative total (correct - each
  // update adds to what's already on record), but the audit log should
  // capture what actually happened IN THIS transaction, not the total after
  // it - so this row logs just the difference from the last recorded total,
  // not the new cumulative figure.
  const paidThisTime = Number(merged.amountPaid || 0) - Number(existing.amountPaid || 0)
  await appendHistory({ ...merged, amountPaid: String(paidThisTime), action: 'updated', actor })
  return merged
}

// Soft delete: the row stays in the database forever with deleted=TRUE
// rather than being removed, so payment/customer history is never lost. The
// Google Calendar event itself is still actually deleted (by the caller,
// via bookings.js) so the calendar slot frees up.
export async function deleteEvent(eventId, actor, cancellationReason) {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM events WHERE event_id = $1', [eventId])
  if (!rows[0]) return
  const existing = rowToEvent(rows[0])

  const updatedDate = new Date().toISOString()
  await query(
    'UPDATE events SET deleted = TRUE, updated_date = $1, updated_by = $2, cancellation_reason = $3 WHERE event_id = $4',
    [updatedDate, actor, cancellationReason || '', eventId]
  )

  const merged = { ...existing, deleted: true, updatedDate, updatedBy: actor, cancellationReason: cancellationReason || '' }
  // No payment happens on cancellation - log 0 for this transaction, same
  // "amount paid THIS action" principle as updateEvent above, not whatever
  // cumulative total happened to be on record at the time.
  await appendHistory({ ...merged, amountPaid: '0', action: 'deleted', actor })
}
