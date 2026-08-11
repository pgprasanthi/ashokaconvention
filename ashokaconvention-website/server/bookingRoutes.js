import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listBookings, createBooking, updateBooking, deleteBooking } from './bookings.js'
import { listEvents, createEvent, updateEvent, deleteEvent } from './events.js'

export const bookingRouter = Router()
bookingRouter.use(requireAuth)

bookingRouter.get('/', async (req, res) => {
  const bookings = await listBookings()

  // Guests only see that a slot is taken, never who/what it's for.
  if (req.user.role === 'guest') {
    return res.json(bookings.map((b) => ({ id: b.id, start: b.start, end: b.end, title: 'Blocked' })))
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
  const { title, start, end, description, customerName, customerEmail, customerMobile, advancePayment, balance, paymentDate } = req.body
  if (!title || !start || !end) {
    return res.status(400).json({ error: 'title, start, and end are required' })
  }
  try {
    const booking = await createBooking({ title, description: description || '', start, end })
    const event = await createEvent({
      eventId: booking.id,
      bookingDate: start.slice(0, 10),
      advancePayment,
      balance,
      paymentDate,
      customerName,
      customerEmail,
      customerMobile,
      actor: req.user.email
    })
    res.status(201).json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.put('/:id', requireRole('admin', 'staff'), async (req, res) => {
  const { title, start, end, description, customerName, customerEmail, customerMobile, advancePayment, balance, paymentDate } = req.body
  if (!title || !start || !end) {
    return res.status(400).json({ error: 'title, start, and end are required' })
  }
  try {
    const booking = await updateBooking(req.params.id, { title, description: description || '', start, end })
    const event = await updateEvent(req.params.id, {
      bookingDate: start.slice(0, 10),
      advancePayment,
      balance,
      paymentDate,
      customerName,
      customerEmail,
      customerMobile,
      actor: req.user.email
    })
    res.json({ ...booking, ...event })
  } catch (err) {
    res.status(err.code === 'CONFLICT' ? 409 : 500).json({ error: err.message })
  }
})

bookingRouter.delete('/:id', requireRole('admin', 'staff'), async (req, res) => {
  await deleteBooking(req.params.id)
  await deleteEvent(req.params.id)
  res.status(204).end()
})
