import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { getSettings, updateSettings } from './settings.js'
import { DEFAULT_REMINDER_TEXT, DEFAULT_DAYS_BEFORE } from './paymentReminders.js'

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
  whatsapp_menu_inquiry_text: '',
  // Payment-reminder queue (see paymentReminders.js). The message body
  // supports {name} {event} {hall} {date} {due_date} {balance} {amount_paid}
  // {committed} placeholders; days_before is how early a due payment appears.
  payment_reminder_text: DEFAULT_REMINDER_TEXT,
  payment_reminder_days_before: String(DEFAULT_DAYS_BEFORE)
}

settingsRouter.get('/', async (req, res) => {
  res.json({ ...DEFAULTS, ...(await getSettings()) })
})

settingsRouter.put('/', async (req, res) => {
  const {
    whatsapp_greeting_enabled, whatsapp_greeting_text, whatsapp_away_enabled, whatsapp_away_text,
    whatsapp_menu_availability_text, whatsapp_menu_booking_text, whatsapp_menu_inquiry_text,
    payment_reminder_text, payment_reminder_days_before
  } = req.body
  const updates = {
    whatsapp_greeting_enabled: whatsapp_greeting_enabled ? 'TRUE' : 'FALSE',
    whatsapp_greeting_text: whatsapp_greeting_text || '',
    whatsapp_away_enabled: whatsapp_away_enabled ? 'TRUE' : 'FALSE',
    whatsapp_away_text: whatsapp_away_text || '',
    whatsapp_menu_availability_text: whatsapp_menu_availability_text || '',
    whatsapp_menu_booking_text: whatsapp_menu_booking_text || '',
    whatsapp_menu_inquiry_text: whatsapp_menu_inquiry_text || '',
    payment_reminder_text: payment_reminder_text || DEFAULT_REMINDER_TEXT,
    // Clamp to a sane range - a negative or huge value would make the queue
    // either never show anything or show every unpaid booking ever.
    payment_reminder_days_before: String(Math.min(Math.max(parseInt(payment_reminder_days_before, 10) || DEFAULT_DAYS_BEFORE, 0), 30))
  }
  res.json({ ...DEFAULTS, ...(await updateSettings(updates)) })
})
