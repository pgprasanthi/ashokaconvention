import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listBookings, createBooking, updateBooking, deleteBooking } from './bookings.js'
import { listEvents, createEvent, updateEvent, deleteEvent } from './events.js'
import { HALLS } from './halls.js'

export const bookingRouter = Router()
bookingRouter.use(requireAuth)

function missingRequiredFields({ title, start, end, customerName, customerMobile, amountPaid, hall, committedAmount }) {
  const isBlank = (v) => v === undefined || v === null || v === ''
  if (isBlank(title) || isBlank(start) || isBlank(end) || isBlank(customerName) || isBlank(customerMobile) || isBlank(amountPaid) || isBlank(hall)) {
    return 'title, start, end, customer name, customer mobile, amount paid, and hall are required'
  }
  if (!HALLS.includes(hall)) {
    return `hall must be one of: ${HALLS.join(', ')}`
  }
  if (!/^\d{10}$/.test(customerMobile)) {
    return 'customer mobile must be a valid 10-digit number'
  }
  if (!/^\d+(\.\d+)?$/.test(String(amountPaid))) {
    return 'amount paid must be a number'
  }
  if (!isBlank(committedAmount) && !/^\d+(\.\d+)?$/.test(String(committedAmount))) {
    return 'committed amount must be a number'
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
    amountPaid, paymentDate, hall,
    eventType, referredBy, committedAmount, closedBy, guestCount, paymentDueDate
  } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, amountPaid, hall, committedAmount })
  if (error) return res.status(400).json({ error })
  try {
    // Notes is free-form - whatever the user typed, from mobile or the app,
    // goes straight to Calendar's description with no reformatting.
    const booking = await createBooking({ title, description, start, end, hall })
    const event = await createEvent({
      eventId: booking.id,
      bookingDate: start.slice(0, 10),
      amountPaid,
      paymentDate,
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
      committedAmount,
      closedBy,
      guestCount,
      paymentDueDate,
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
    amountPaid, paymentDate, hall,
    eventType, referredBy, committedAmount, closedBy, guestCount, paymentDueDate
  } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, amountPaid, hall, committedAmount })
  if (error) return res.status(400).json({ error })
  const eventFields = {
    bookingDate: start.slice(0, 10),
    amountPaid,
    paymentDate,
    customerName,
    customerEmail,
    customerMobile,
    customerAddress,
    hall,
    eventName: title,
    eventType,
    referredBy,
    committedAmount,
    closedBy,
    guestCount,
    paymentDueDate,
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
