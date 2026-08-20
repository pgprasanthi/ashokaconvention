import { Router } from 'express'
import { recordLead, recordOutboundMessage, shouldSendAwayMessage, markAwaySent, normalizePhone } from './whatsappLeads.js'
import { getSettings } from './settings.js'
import { sendWhatsAppMessage, sendWhatsAppButtons } from './whatsappSend.js'

// The greeting doubles as a smart menu - these ids come back on the webhook
// as interactive.button_reply.id when the customer taps one, and map to
// which follow-up text (configured in WhatsApp Settings) to send next.
const MENU_BUTTONS = [
  { id: 'menu_availability', title: 'Check Availability' },
  { id: 'menu_booking', title: 'Make a Booking' },
  { id: 'menu_inquiry', title: 'General Inquiry' }
]
const MENU_REPLY_SETTING_KEY = {
  menu_availability: 'whatsapp_menu_availability_text',
  menu_booking: 'whatsapp_menu_booking_text',
  menu_inquiry: 'whatsapp_menu_inquiry_text'
}

const { WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_WABA_ID, WHATSAPP_PHONE_NUMBER_ID } = process.env

if (!WHATSAPP_WEBHOOK_VERIFY_TOKEN || !WHATSAPP_WABA_ID || !WHATSAPP_PHONE_NUMBER_ID) {
  throw new Error('WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_WABA_ID, and WHATSAPP_PHONE_NUMBER_ID must be set (see server/.env.example)')
}

export const whatsappRouter = Router()

// Meta's one-time handshake when you first save the webhook URL: it sends a
// GET with hub.verify_token, and expects the hub.challenge value echoed back
// if the token matches.
whatsappRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Real messages arrive via Dualhook's Embedded Signup flow, which delivers
// them straight from Meta - but signed with DUALHOOK'S Meta App secret, not
// ours, so HMAC signature verification (X-Hub-Signature-256) can never pass
// here. Confirmed with Dualhook support. The substitute protection is this
// route's confidential URL path (see index.js) plus checking the payload
// actually names our WABA and phone number, so a request that merely finds
// the URL still can't spoof data for our account without also knowing both
// IDs (which aren't secret, but narrow things down further than nothing).
function isFromExpectedAccount(body) {
  if (body?.object !== 'whatsapp_business_account') return false
  return (body.entry || []).some((entry) =>
    entry.id === WHATSAPP_WABA_ID &&
    (entry.changes || []).some((change) => change.value?.metadata?.phone_number_id === WHATSAPP_PHONE_NUMBER_ID)
  )
}

// Outbound replies staff send from the WhatsApp Business app (Coexistence
// mode) are delivered back to the webhook as "echo" events, separate from
// inbound customer messages. NOTE: the exact field name/shape here is a
// best guess based on available docs ("smb_message_echoes") - this hasn't
// been verified against a real payload yet. May need adjusting once real
// echo events are seen.
function extractOutboundEchoes(body) {
  const out = []
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'smb_message_echoes') continue
      for (const message of change.value?.message_echoes || change.value?.messages || []) {
        out.push({ phone: message.to || message.recipient_id })
      }
    }
  }
  return out
}

// Pulls the sender, name, and (if this came from a Click-to-WhatsApp ad) the
// ad referral info out of Meta's webhook payload shape. Returns [] if this
// event isn't an inbound text message (e.g. a delivery/read status update).
function extractMessages(body) {
  const out = []
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== 'messages') continue
      const value = change.value || {}
      const contactsByWaId = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]))
      for (const message of value.messages || []) {
        out.push({
          phone: message.from,
          name: contactsByWaId.get(message.from) || '',
          adSource: message.referral?.headline || message.referral?.source_url || '',
          buttonReplyId: message.interactive?.button_reply?.id || null
        })
      }
    }
  }
  return out
}

// Two webhook deliveries for the same number arriving close together (e.g. a
// customer sends two messages in a row) would otherwise race: both read "no
// existing lead row" before either had written one, both create a row, and
// both treat the contact as first-time - sending the greeting twice. This
// queues handling per normalized phone number so only one runs at a time.
const phoneLocks = new Map()
function withPhoneLock(phone, fn) {
  const key = normalizePhone(phone)
  const prior = phoneLocks.get(key) || Promise.resolve()
  const next = prior.then(fn, fn)
  phoneLocks.set(key, next.catch(() => {}))
  return next
}

// Handles one inbound message: records the lead, then fires the greeting
// (first-time contacts only) and/or away message (at most once per cooldown
// window) if enabled in Settings. Runs after the response is already sent,
// so a slow Dualhook send call never delays Meta's acknowledgment.
async function handleInboundMessage({ phone, name, adSource, buttonReplyId }) {
  const { isNew } = await recordLead({ phone, name, adSource })
  const settings = await getSettings()

  // A tap on one of the greeting's menu buttons - reply with whichever
  // canned follow-up matches that topic and stop there (not a fresh
  // contact, so the greeting/away logic below doesn't apply).
  const settingKey = buttonReplyId && MENU_REPLY_SETTING_KEY[buttonReplyId]
  if (settingKey) {
    if (settings[settingKey]) await sendWhatsAppMessage(phone, settings[settingKey])
    return
  }

  if (isNew && settings.whatsapp_greeting_enabled === 'TRUE' && settings.whatsapp_greeting_text) {
    await sendWhatsAppButtons(phone, settings.whatsapp_greeting_text, MENU_BUTTONS)
  }
  if (settings.whatsapp_away_enabled === 'TRUE' && settings.whatsapp_away_text && await shouldSendAwayMessage(phone)) {
    await sendWhatsAppMessage(phone, settings.whatsapp_away_text)
    await markAwaySent(phone)
  }
}

// Actual incoming message/status events land here. Meta expects a fast
// acknowledgment, so respond immediately and do the Sheets write (and any
// auto-reply sends) afterward rather than making Meta wait on it.
whatsappRouter.post('/', (req, res) => {
  if (!isFromExpectedAccount(req.body)) return res.sendStatus(403)
  res.sendStatus(200)

  const messages = extractMessages(req.body)
  const echoes = extractOutboundEchoes(req.body)
  console.log(`WhatsApp webhook: ${messages.length} inbound message(s), ${echoes.length} outbound echo(es)`)

  for (const message of messages) {
    withPhoneLock(message.phone, () => handleInboundMessage(message)).catch((err) => {
      console.error('Failed to process WhatsApp message:', err.message)
    })
  }
  for (const { phone } of echoes) {
    recordOutboundMessage(phone).catch((err) => {
      console.error('Failed to record outbound WhatsApp message:', err.message)
    })
  }
})
