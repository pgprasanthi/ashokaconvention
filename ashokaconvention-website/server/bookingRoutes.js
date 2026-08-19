import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listBookings, createBooking, updateBooking, deleteBooking } from './bookings.js'
import { listEvents, createEvent, updateEvent, deleteEvent } from './events.js'
import { HALLS } from './halls.js'

export const bookingRouter = Router()
bookingRouter.use(requireAuth)

function missingRequiredFields({ title, start, end, customerName, customerMobile, advancePayment, hall }) {
  const isBlank = (v) => v === undefined || v === null || v === ''
  if (isBlank(title) || isBlank(start) || isBlank(end) || isBlank(customerName) || isBlank(customerMobile) || isBlank(advancePayment) || isBlank(hall)) {
    return 'title, start, end, customer name, customer mobile, advance payment, and hall are required'
  }
  if (!HALLS.includes(hall)) {
    return `hall must be one of: ${HALLS.join(', ')}`
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
  const { title, start, end, description, customerName, customerEmail, customerMobile, advancePayment, balance, paymentDate, fullyPaid, hall } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, advancePayment, hall })
  if (error) return res.status(400).json({ error })
  try {
    const booking = await createBooking({ title, description: description || '', start, end, hall })
    const event = await createEvent({
      eventId: booking.id,
      bookingDate: start.slice(0, 10),
      advancePayment,
      balance,
      paymentDate,
      customerName,
      customerEmail,
      customerMobile,
      fullyPaid,
      hall,
      actor: req.user.email
    })
    res.status(201).json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.put('/:id', requireRole('admin', 'staff'), async (req, res) => {
  const { title, start, end, description, customerName, customerEmail, customerMobile, advancePayment, balance, paymentDate, fullyPaid, hall } = req.body
  const error = missingRequiredFields({ title, start, end, customerName, customerMobile, advancePayment, hall })
  if (error) return res.status(400).json({ error })
  try {
    const booking = await updateBooking(req.params.id, { title, description: description || '', start, end, hall })
    const event = await updateEvent(req.params.id, {
      bookingDate: start.slice(0, 10),
      advancePayment,
      balance,
      paymentDate,
      customerName,
      customerEmail,
      customerMobile,
      fullyPaid,
      hall,
      actor: req.user.email
    })
    res.json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.delete('/:id', requireRole('admin', 'staff'), async (req, res) => {
  await deleteBooking(req.params.id)
  await deleteEvent(req.params.id, req.user.email)
  res.status(204).end()
})
