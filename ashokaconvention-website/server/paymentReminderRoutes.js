import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listDueReminders, sendReminder } from './paymentReminders.js'

export const paymentReminderRouter = Router()
// Staff and admin both chase payments day-to-day. The message TEMPLATE is
// admin-only (WhatsApp Settings), but sending a reminder isn't.
paymentReminderRouter.use(requireAuth, requireRole('admin', 'staff'))

paymentReminderRouter.get('/', async (req, res) => {
  try {
    res.json(await listDueReminders())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

paymentReminderRouter.post('/:eventId/send', async (req, res) => {
  try {
    res.json(await sendReminder(req.params.eventId, { message: req.body?.message, actor: req.user.email }))
  } catch (err) {
    res.status(err.code === 'BAD_REQUEST' ? 400 : 500).json({ error: err.message })
  }
})
