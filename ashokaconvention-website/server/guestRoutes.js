import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listGuests } from './guests.js'

export const guestRouter = Router()
guestRouter.use(requireAuth, requireRole('admin'))

guestRouter.get('/', async (req, res) => {
  res.json(await listGuests())
})
