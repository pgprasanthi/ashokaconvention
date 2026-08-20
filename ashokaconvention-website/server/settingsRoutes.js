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
  whatsapp_away_text: '',
  // Sent as the reply when a customer taps the matching quick-reply button
  // on the greeting menu (see MENU_BUTTONS in whatsappRoutes.js).
  whatsapp_menu_availability_text: '',
  whatsapp_menu_booking_text: '',
  whatsapp_menu_inquiry_text: ''
}

settingsRouter.get('/', async (req, res) => {
  res.json({ ...DEFAULTS, ...(await getSettings()) })
})

settingsRouter.put('/', async (req, res) => {
  const {
    whatsapp_greeting_enabled, whatsapp_greeting_text, whatsapp_away_enabled, whatsapp_away_text,
    whatsapp_menu_availability_text, whatsapp_menu_booking_text, whatsapp_menu_inquiry_text
  } = req.body
  const updates = {
    whatsapp_greeting_enabled: whatsapp_greeting_enabled ? 'TRUE' : 'FALSE',
    whatsapp_greeting_text: whatsapp_greeting_text || '',
    whatsapp_away_enabled: whatsapp_away_enabled ? 'TRUE' : 'FALSE',
    whatsapp_away_text: whatsapp_away_text || '',
    whatsapp_menu_availability_text: whatsapp_menu_availability_text || '',
    whatsapp_menu_booking_text: whatsapp_menu_booking_text || '',
    whatsapp_menu_inquiry_text: whatsapp_menu_inquiry_text || ''
  }
  res.json({ ...DEFAULTS, ...(await updateSettings(updates)) })
})
