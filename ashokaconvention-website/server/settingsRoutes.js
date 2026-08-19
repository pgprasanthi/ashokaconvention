import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { getSettings, updateSettings } from './settings.js'

export const settingsRouter = Router()
// Admin only - these control automated customer-facing messages.
settingsRouter.use(requireAuth, requireRole('admin'))

const DEFAULTS = {
  whatsapp_greeting_enabled: 'FALSE',
  whatsapp_greeting_text: '',
  whatsapp_away_enabled: 'FALSE',
  whatsapp_away_text: ''
}

settingsRouter.get('/', async (req, res) => {
  res.json({ ...DEFAULTS, ...(await getSettings()) })
})

settingsRouter.put('/', async (req, res) => {
  const { whatsapp_greeting_enabled, whatsapp_greeting_text, whatsapp_away_enabled, whatsapp_away_text } = req.body
  const updates = {
    whatsapp_greeting_enabled: whatsapp_greeting_enabled ? 'TRUE' : 'FALSE',
    whatsapp_greeting_text: whatsapp_greeting_text || '',
    whatsapp_away_enabled: whatsapp_away_enabled ? 'TRUE' : 'FALSE',
    whatsapp_away_text: whatsapp_away_text || ''
  }
  res.json({ ...DEFAULTS, ...(await updateSettings(updates)) })
})
