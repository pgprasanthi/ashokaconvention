import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listLeads, normalizePhone } from './whatsappLeads.js'
import { listEvents } from './events.js'
import { listTeam } from './team.js'

export const reportRouter = Router()
// Admin only - staff must not see marketing/lead conversion data.
reportRouter.use(requireAuth, requireRole('admin'))

reportRouter.get('/whatsapp-conversion', async (req, res) => {
  const { start, end } = req.query
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' })
  }

  const [leads, events] = await Promise.all([listLeads(), listEvents()])
  const bookedPhones = new Set(events.map((e) => normalizePhone(e.customerMobile)).filter(Boolean))

  const inRange = leads.filter((l) => {
    const day = (l.firstMessage || '').slice(0, 10)
    return day >= start && day <= end
  })

  const results = inRange.map((l) => {
    const converted = bookedPhones.has(normalizePhone(l.phone))
    return {
      phone: l.phone,
      name: l.name,
      firstMessage: l.firstMessage,
      lastMessage: l.lastMessage,
      messageCount: l.messageCount,
      adSource: l.adSource,
      converted,
      status: converted ? 'converted' : l.status === 'lost' ? 'lost' : 'open',
      lostReason: l.lostReason
    }
  })

  const converted = results.filter((r) => r.converted).length
  const lost = results.filter((r) => r.status === 'lost').length

  const lostReasonBreakdown = {}
  for (const r of results) {
    if (r.status !== 'lost') continue
    lostReasonBreakdown[r.lostReason] = (lostReasonBreakdown[r.lostReason] || 0) + 1
  }

  res.json({
    start,
    end,
    totalLeads: results.length,
    converted,
    lost,
    open: results.length - converted - lost,
    conversionRate: results.length ? Math.round((converted / results.length) * 1000) / 10 : 0,
    lostReasonBreakdown,
    leads: results
  })
})

reportRouter.get('/staff-performance', async (req, res) => {
  const { start, end } = req.query
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' })
  }

  const [leads, events, team] = await Promise.all([listLeads(), listEvents(), listTeam()])
  const bookedPhones = new Set(events.map((e) => normalizePhone(e.customerMobile)).filter(Boolean))
  const nameByEmail = new Map(team.map((m) => [m.email, m.name]))

  const inRange = leads.filter((l) => {
    const day = (l.firstMessage || '').slice(0, 10)
    return day >= start && day <= end
  })

  const byStaff = new Map()
  function statFor(email) {
    if (!byStaff.has(email)) {
      byStaff.set(email, {
        email, name: nameByEmail.get(email) || email,
        leadsAssigned: 0, conversations: 0, converted: 0, lost: 0, dealsClosed: 0
      })
    }
    return byStaff.get(email)
  }

  for (const lead of inRange) {
    if (!lead.assignedTo) continue
    const stat = statFor(lead.assignedTo)
    stat.leadsAssigned += 1
    stat.conversations += lead.messageCount
    if (bookedPhones.has(normalizePhone(lead.phone))) stat.converted += 1
    else if (lead.status === 'lost') stat.lost += 1
  }

  // Deals closed comes straight from Events' "Created By" - whoever entered
  // the booking closed it, regardless of whether the customer was ever a
  // tracked WhatsApp lead (e.g. walk-ins, phone inquiries).
  const dealsInRange = events.filter((e) => !e.deleted && (e.createdDate || '').slice(0, 10) >= start && (e.createdDate || '').slice(0, 10) <= end)
  const deals = dealsInRange.map((e) => ({
    staffEmail: e.createdBy,
    staffName: nameByEmail.get(e.createdBy) || e.createdBy,
    customerName: e.customerName,
    customerMobile: e.customerMobile,
    bookingDate: e.bookingDate,
    createdDate: e.createdDate
  }))
  for (const deal of deals) {
    if (!deal.staffEmail) continue
    statFor(deal.staffEmail).dealsClosed += 1
  }

  const staff = [...byStaff.values()].map((s) => ({
    ...s,
    conversionRate: s.leadsAssigned ? Math.round((s.converted / s.leadsAssigned) * 1000) / 10 : 0
  })).sort((a, b) => b.dealsClosed - a.dealsClosed)

  res.json({ start, end, staff, deals })
})
