import { query, ensureSchema, toNullIfBlank, dateToISODate, dateToISOString, withTransaction } from './db.js'
import { appendHistory } from './eventHistory.js'
import { findOrCreateCustomer } from './customers.js'
import { upsertPayment, listPaymentsForEvent, listPaymentsForEvents } from './payments.js'

// Postgres error code 23505 = unique_violation. Translates the DB-level
// constraint error (customer + hall + booking date already booked) into
// something bookingRoutes.js already knows how to surface as a 409, same as
// the Calendar hall-conflict check.
function duplicateBookingError(err) {
  if (err.code !== '23505' || err.constraint !== 'events_customer_hall_date_unique') return err
  const dupError = new Error('This customer already has a booking for this hall on this date')
  dupError.code = 'CONFLICT'
  return dupError
}

// Sums a numeric field across a payment type's line items, e.g. total
// committed / total paid / total balance across hall rent + catering +
// decor etc. Blank if none of the line items have a value for it yet.
function sumField(payments, field) {
  const nums = payments.map((p) => Number(p[field])).filter(Number.isFinite)
  if (!nums.length) return ''
  return String(nums.reduce((a, b) => a + b, 0))
}

function rowToEvent(row, payments) {
  return {
    eventId: row.event_id,
    customerId: row.customer_id,
    bookingDate: dateToISODate(row.booking_date),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerMobile: row.customer_mobile,
    customerAddress: row.customer_address,
    createdBy: row.created_by,
    createdDate: dateToISOString(row.created_date),
    updatedDate: dateToISOString(row.updated_date),
    updatedBy: row.updated_by,
    deleted: row.deleted,
    hall: row.hall,
    eventName: row.event_name,
    eventType: row.event_type,
    referredBy: row.referred_by,
    closedBy: row.closed_by,
    guestCount: row.guest_count ?? '',
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    // Per-payment-type detail (hall rent, catering, decor, ...), each with
    // its own committed amount and balance - see payments.js.
    payments,
    // Totals across every payment type, for callers that just want "the"
    // numbers (reports, CSV overview, the calendar list) without caring
    // about the breakdown.
    committedAmount: sumField(payments, 'committedAmount'),
    amountPaid: sumField(payments, 'amountPaid'),
    balance: sumField(payments, 'balance'),
    fullyPaid: payments.length > 0 && payments.every((p) => p.fullyPaid)
  }
}

const CUSTOMER_JOIN_SELECT = `
  SELECT e.*, c.name AS customer_name, c.email AS customer_email, c.mobile AS customer_mobile, c.address AS customer_address
  FROM events e JOIN customers c ON c.id = e.customer_id
`

async function fetchEvents() {
  await ensureSchema()
  const { rows } = await query(`${CUSTOMER_JOIN_SELECT} ORDER BY e.created_date ASC`)
  const paymentsByEvent = await listPaymentsForEvents(query, rows.map((r) => r.event_id))
  return rows.map((row) => rowToEvent(row, paymentsByEvent.get(row.event_id) || []))
}

export async function listEvents() {
  const events = await fetchEvents()
  return events.filter((e) => !e.deleted)
}

// eventId is the linked Google Calendar event id. `payments` is the list of
// initial payment line items (usually just one - hall rent - from the
// booking form's Payment step): [{ paymentType, committedAmount, amountPaid,
// paymentDate, paymentDueDate, notes }].
export async function createEvent({
  eventId, bookingDate, customerName, customerEmail, customerMobile, customerAddress,
  hall, eventName, eventType, referredBy, closedBy, guestCount, notes, payments, actor
}) {
  await ensureSchema()
  const now = new Date().toISOString()
  const paymentInputs = payments?.length ? payments : [{ paymentType: 'hall_rent' }]

  let savedPayments
  try {
    savedPayments = await withTransaction(async (client) => {
      const customerId = await findOrCreateCustomer(client, {
        name: customerName, email: customerEmail, mobile: customerMobile, address: customerAddress
      })
      await client.query(
        `INSERT INTO events (
           event_id, customer_id, booking_date, created_by, created_date, updated_date, updated_by, deleted,
           hall, event_name, event_type, referred_by, closed_by, guest_count, notes
         )
         VALUES ($1, $2, $3, $4, $5, $5, $4, FALSE, $6, $7, $8, $9, $10, $11, $12)`,
        [
          eventId, customerId, toNullIfBlank(bookingDate), actor, now, hall || '', eventName || '',
          eventType || '', referredBy || '', closedBy || '', toNullIfBlank(guestCount), notes || ''
        ]
      )
      const saved = []
      for (const p of paymentInputs) {
        saved.push(await upsertPayment(client, {
          eventId, customerId, paymentType: p.paymentType || 'hall_rent',
          committedAmount: p.committedAmount, amountPaid: p.amountPaid,
          paymentDate: p.paymentDate, paymentDueDate: p.paymentDueDate, notes: p.notes, actor
        }))
      }
      return saved
    })
  } catch (err) {
    throw duplicateBookingError(err)
  }

  const event = {
    eventId, bookingDate: bookingDate || '', customerName: customerName || '', customerEmail: customerEmail || '',
    customerMobile: customerMobile || '', customerAddress: customerAddress || '', createdBy: actor, createdDate: now,
    updatedDate: now, updatedBy: actor, deleted: false, hall: hall || '', eventName: eventName || '',
    eventType: eventType || '', referredBy: referredBy || '', closedBy: closedBy || '', guestCount: guestCount || '',
    cancellationReason: '', notes: notes || '', payments: savedPayments,
    committedAmount: sumField(savedPayments, 'committedAmount'), amountPaid: sumField(savedPayments, 'amountPaid'),
    balance: sumField(savedPayments, 'balance'), fullyPaid: savedPayments.every((p) => p.fullyPaid)
  }
  for (const p of savedPayments) {
    await appendHistory({ ...event, ...p, action: 'created', actor })
  }
  return event
}

// Once a payment line item is saved fully paid, ITS payment fields (amount
// paid, balance, payment date, committed amount, payment due date, fully
// paid) lock - enforced in payments.js's upsertPayment, per type
// independently. Booking/customer details stay editable regardless.
// `payments` (optional) is the list of payment type changes to apply:
// [{ paymentType, committedAmount, amountPaid, paymentDate, paymentDueDate, notes }].
export async function updateEvent(eventId, {
  bookingDate, customerName, customerEmail, customerMobile, customerAddress,
  hall, eventName, eventType, referredBy, closedBy, guestCount, notes, payments, actor
}) {
  await ensureSchema()
  const { rows } = await query(`${CUSTOMER_JOIN_SELECT} WHERE e.event_id = $1`, [eventId])
  if (!rows[0]) throw new Error('Event not found')
  const existingPayments = await listPaymentsForEvent(query, eventId)
  const existing = rowToEvent(rows[0], existingPayments)

  const merged = {
    ...existing,
    bookingDate: bookingDate ?? existing.bookingDate,
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

  let savedPayments
  try {
    savedPayments = await withTransaction(async (client) => {
      // Customer fields are only ever editable while a booking is still
      // "incomplete" (see BookingsCalendar.jsx) - so this only actually
      // resolves a different customer_id when filling in a booking that had
      // none yet, not on an ordinary edit.
      let customerId = rows[0].customer_id
      if (customerName !== undefined || customerMobile !== undefined) {
        customerId = await findOrCreateCustomer(client, {
          name: merged.customerName, email: merged.customerEmail, mobile: merged.customerMobile, address: merged.customerAddress
        })
      }
      await client.query(
        `UPDATE events SET customer_id = $1, booking_date = $2, updated_date = $3, updated_by = $4, hall = $5,
           event_name = $6, event_type = $7, referred_by = $8, closed_by = $9, guest_count = $10, notes = $11
         WHERE event_id = $12`,
        [
          customerId, toNullIfBlank(merged.bookingDate), merged.updatedDate, merged.updatedBy, merged.hall,
          merged.eventName, merged.eventType, merged.referredBy, merged.closedBy, toNullIfBlank(merged.guestCount),
          merged.notes, eventId
        ]
      )
      const saved = []
      for (const p of (payments || [])) {
        saved.push(await upsertPayment(client, {
          eventId, customerId, paymentType: p.paymentType,
          committedAmount: p.committedAmount, amountPaid: p.amountPaid,
          paymentDate: p.paymentDate, paymentDueDate: p.paymentDueDate, notes: p.notes, actor
        }))
      }
      return saved
    })
  } catch (err) {
    throw duplicateBookingError(err)
  }

  // Merge the freshly-saved payment types back into the full list (unsaved
  // types on this event are untouched, so keep their prior state).
  const savedByType = new Map(savedPayments.map((p) => [p.paymentType, p]))
  merged.payments = existingPayments.map((p) => savedByType.get(p.paymentType) || p)
  for (const p of savedPayments) {
    if (!merged.payments.some((existingP) => existingP.paymentType === p.paymentType)) merged.payments.push(p)
  }
  merged.committedAmount = sumField(merged.payments, 'committedAmount')
  merged.amountPaid = sumField(merged.payments, 'amountPaid')
  merged.balance = sumField(merged.payments, 'balance')
  merged.fullyPaid = merged.payments.length > 0 && merged.payments.every((p) => p.fullyPaid)

  if (savedPayments.length) {
    // events.amount_paid per type is the running cumulative total (correct -
    // each update adds to what's already on record), but the audit log
    // should capture what actually happened IN THIS transaction, not the
    // total after it - so this row logs just the difference from the last
    // recorded total for that payment type, not the new cumulative figure.
    for (const p of savedPayments) {
      const before = existingPayments.find((ep) => ep.paymentType === p.paymentType)
      const paidThisTime = Number(p.amountPaid || 0) - Number(before?.amountPaid || 0)
      await appendHistory({ ...merged, ...p, amountPaid: String(paidThisTime), action: 'updated', actor })
    }
  } else {
    // Pure event/customer edit - no payment line item changed.
    await appendHistory({ ...merged, paymentType: '', amountPaid: '0', balance: '', fullyPaid: false, action: 'updated', actor })
  }
  return merged
}

// Soft delete: the row stays in the database forever with deleted=TRUE
// rather than being removed, so payment/customer history is never lost. The
// Google Calendar event itself is still actually deleted (by the caller,
// via bookings.js) so the calendar slot frees up.
export async function deleteEvent(eventId, actor, cancellationReason) {
  await ensureSchema()
  const { rows } = await query(`${CUSTOMER_JOIN_SELECT} WHERE e.event_id = $1`, [eventId])
  if (!rows[0]) return
  const payments = await listPaymentsForEvent(query, eventId)
  const existing = rowToEvent(rows[0], payments)

  const updatedDate = new Date().toISOString()
  await query(
    'UPDATE events SET deleted = TRUE, updated_date = $1, updated_by = $2, cancellation_reason = $3 WHERE event_id = $4',
    [updatedDate, actor, cancellationReason || '', eventId]
  )

  const merged = { ...existing, deleted: true, updatedDate, updatedBy: actor, cancellationReason: cancellationReason || '' }
  // No payment happens on cancellation - log 0 for this transaction, same
  // "amount paid THIS action" principle as updateEvent above, not whatever
  // cumulative total happened to be on record at the time.
  await appendHistory({ ...merged, paymentType: '', amountPaid: '0', action: 'deleted', actor })
}
