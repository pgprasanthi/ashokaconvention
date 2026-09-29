import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listBookings, createBooking, updateBooking, deleteBooking } from './bookings.js'
import { listEvents, createEvent, updateEvent, deleteEvent } from './events.js'
import { getChecklist, saveChecks } from './eventChecks.js'
import { HALLS } from './halls.js'
import { PAYMENT_TYPES } from './paymentTypes.js'

export const bookingRouter = Router()
bookingRouter.use(requireAuth)

// requirePayment: true on create (a booking must start with at least one
// payment type) - false on update, where an empty payments array just means
// "nothing about any payment changed this visit," a normal no-op edit.
function missingRequiredFields({ title, start, end, customerName, customerMobile, hall, payments }, requirePayment) {
  const isBlank = (v) => v === undefined || v === null || v === ''
  if (isBlank(title) || isBlank(start) || isBlank(end) || isBlank(customerName) || isBlank(customerMobile) || isBlank(hall)) {
    return 'title, start, end, customer name, customer mobile, and hall are required'
  }
  if (!HALLS.includes(hall)) {
    return `hall must be one of: ${HALLS.join(', ')}`
  }
  if (!/^\d{10}$/.test(customerMobile)) {
    return 'customer mobile must be a valid 10-digit number'
  }
  if (!Array.isArray(payments)) {
    return 'payments must be an array'
  }
  if (requirePayment && !payments.length) {
    return 'at least one payment type with an amount paid is required'
  }
  for (const p of payments) {
    if (!PAYMENT_TYPES.includes(p.paymentType)) {
      return `payment type must be one of: ${PAYMENT_TYPES.join(', ')}`
    }
    // 'other' can repeat on the same booking (DJ, photography, ...) - a
    // description is what tells them apart, so it's required there even
    // though the fixed types don't need one.
    if (p.paymentType === 'other' && isBlank(p.label?.trim?.() ?? p.label)) {
      return 'a description is required for an Other payment'
    }
    if (isBlank(p.amountPaid) || !/^\d+(\.\d+)?$/.test(String(p.amountPaid))) {
      return 'amount paid must be a number for every payment type'
    }
    if (!isBlank(p.committedAmount) && !/^\d+(\.\d+)?$/.test(String(p.committedAmount))) {
      return 'committed amount must be a number for every payment type'
    }
  }
  return null
}

bookingRouter.get('/', async (req, res) => {
  const bookings = await listBookings()

  // Guests only see that a slot is taken, never who/what it's for - but the
  // hall is fine to show, since it just helps them see which halls are free.
  if (req.user.role === 'guest') {
    return res.json(bookings.map((b) => ({ id: b.id, start: b.start, end: b.end, title: 'Blocked', hall: b.hall })))
  }

  const events = await listEvents()
  const eventsById = new Map(events.map((e) => [e.eventId, e]))
  // Bookings created directly on a phone's calendar app (not through this app)
  // have no matching Events row - flag them so the UI can prompt for details.
  res.json(bookings.map((b) => {
    const event = eventsById.get(b.id)
    return { ...b, ...event, hasDetails: Boolean(event) }
  }))
})

bookingRouter.post('/', requireRole('admin', 'staff'), async (req, res) => {
  const {
    title, start, end, description, customerName, customerEmail, customerMobile, customerAddress,
    hall, eventType, referredBy, closedBy, guestCount, payments
  } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, hall, payments }, true)
  if (error) return res.status(400).json({ error })
  try {
    // Notes is free-form - whatever the user typed, from mobile or the app,
    // goes straight to Calendar's description with no reformatting.
    const booking = await createBooking({ title, description, start, end, hall })
    const event = await createEvent({
      eventId: booking.id,
      bookingDate: start.slice(0, 10),
      customerName,
      customerEmail,
      customerMobile,
      customerAddress,
      hall,
      // Mirrors the Calendar event's title, so reports/queries don't need to
      // cross-reference Calendar just to know what an event was called.
      eventName: title,
      eventType,
      referredBy,
      closedBy,
      guestCount,
      // One or more { paymentType, committedAmount, amountPaid, paymentDate,
      // paymentDueDate } line items from the booking form's Payment step.
      payments,
      // Mirrors the same "Notes" field sent to Calendar as its description,
      // so it's queryable/reportable without cross-referencing Calendar.
      notes: description,
      actor: req.user.email
    })
    res.status(201).json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.put('/:id', requireRole('admin', 'staff'), async (req, res) => {
  const {
    title, start, end, description, customerName, customerEmail, customerMobile, customerAddress,
    hall, eventType, referredBy, closedBy, guestCount, payments
  } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, hall, payments }, false)
  if (error) return res.status(400).json({ error })
  const eventFields = {
    bookingDate: start.slice(0, 10),
    customerName,
    customerEmail,
    customerMobile,
    customerAddress,
    hall,
    eventName: title,
    eventType,
    referredBy,
    closedBy,
    guestCount,
    payments,
    notes: description,
    actor: req.user.email
  }
  try {
    let event
    try {
      event = await updateEvent(req.params.id, eventFields)
    } catch (err) {
      if (err.message !== 'Event not found') throw err
      // A booking created outside the app (e.g. a phone's calendar) has no
      // Postgres row at all yet - this "edit" is actually its first save,
      // so create the row now instead, reusing the existing Calendar event
      // id rather than treating the missing row as a real error.
      event = await createEvent({ eventId: req.params.id, ...eventFields })
    }
    // Notes is free-form - whatever the user typed goes straight to
    // Calendar's description with no reformatting.
    const booking = await updateBooking(req.params.id, { title, description, start, end, hall })
    res.json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.delete('/:id', requireRole('admin', 'staff'), async (req, res) => {
  await deleteBooking(req.params.id)
  await deleteEvent(req.params.id, req.user.email, req.body?.cancellationReason)
  res.status(204).end()
})

// Pre/post-event readiness checklist. Both admin and staff - same access as
// editing the booking itself. The checklist works on past events too (unlike
// the booking form), so the closeout items can be ticked after the function.
bookingRouter.get('/:id/checklist', requireRole('admin', 'staff'), async (req, res) => {
  try {
    res.json(await getChecklist(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

bookingRouter.put('/:id/checklist', requireRole('admin', 'staff'), async (req, res) => {
  try {
    res.json(await saveChecks(req.params.id, req.body?.items, req.user.email))
  } catch (err) {
    res.status(err.code === 'BAD_REQUEST' ? 400 : 500).json({ error: err.message })
  }
})
