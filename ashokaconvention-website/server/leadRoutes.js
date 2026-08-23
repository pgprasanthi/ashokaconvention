import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listLeads, assignLead, markLeadLost } from './whatsappLeads.js'
import { listMessages } from './whatsappMessages.js'

export const leadRouter = Router()
// Staff and admin both work leads day-to-day - guests never see this.
leadRouter.use(requireAuth, requireRole('admin', 'staff'))

leadRouter.get('/', async (req, res) => {
  res.json(await listLeads())
})

leadRouter.get('/:phone/messages', async (req, res) => {
  res.json(await listMessages(req.params.phone))
})

leadRouter.put('/:phone/assign', async (req, res) => {
  try {
    await assignLead(req.params.phone, req.user.email)
    res.json(await listLeads())
  } catch {
    res.status(404).json({ error: 'Lead not found' })
  }
})

leadRouter.put('/:phone/lost', async (req, res) => {
  const { reason } = req.body
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required to mark a lead as not closed' })
  }
  try {
    await markLeadLost(req.params.phone, reason.trim())
    res.json(await listLeads())
  } catch {
    res.status(404).json({ error: 'Lead not found' })
  }
})
