import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { listTeam, addTeamMember, updateTeamMember, removeTeamMember } from './team.js'

const VALID_ROLES = new Set(['admin', 'staff'])

export const teamRouter = Router()
teamRouter.use(requireAuth, requireRole('admin'))

teamRouter.get('/', async (req, res) => {
  res.json(await listTeam())
})

teamRouter.post('/', async (req, res) => {
  const { email, role, name, joinedOn, mobile } = req.body
  if (!email || !VALID_ROLES.has(role)) {
    return res.status(400).json({ error: 'email and role (admin/staff) are required' })
  }
  await addTeamMember({ email, role, name: name || '', joinedOn: joinedOn || '', mobile: mobile || '' })
  res.status(201).json(await listTeam())
})

teamRouter.put('/:email', async (req, res) => {
  const { role } = req.body
  if (role && !VALID_ROLES.has(role)) {
    return res.status(400).json({ error: 'role must be admin or staff' })
  }
  try {
    await updateTeamMember(req.params.email, req.body)
    res.json(await listTeam())
  } catch {
    res.status(404).json({ error: 'Team member not found' })
  }
})

teamRouter.delete('/:email', async (req, res) => {
  try {
    await removeTeamMember(req.params.email)
    res.status(204).end()
  } catch {
    res.status(404).json({ error: 'Team member not found' })
  }
})
