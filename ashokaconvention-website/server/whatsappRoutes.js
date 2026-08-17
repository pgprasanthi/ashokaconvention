import { Router } from 'express'
import { recordLead, recordOutboundMessage } from './whatsappLeads.js'

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
          adSource: message.referral?.headline || message.referral?.source_url || ''
        })
      }
    }
  }
  return out
}

// Actual incoming message/status events land here. Meta expects a fast
// acknowledgment, so respond immediately and do the Sheets write afterward
// rather than making Meta wait on it.
whatsappRouter.post('/', (req, res) => {
  if (!isFromExpectedAccount(req.body)) return res.sendStatus(403)
  res.sendStatus(200)

  const messages = extractMessages(req.body)
  const echoes = extractOutboundEchoes(req.body)
  console.log(`WhatsApp webhook: ${messages.length} inbound message(s), ${echoes.length} outbound echo(es)`)

  for (const { phone, name, adSource } of messages) {
    recordLead({ phone, name, adSource }).catch((err) => {
      console.error('Failed to record WhatsApp lead:', err.message)
    })
  }
  for (const { phone } of echoes) {
    recordOutboundMessage(phone).catch((err) => {
      console.error('Failed to record outbound WhatsApp message:', err.message)
    })
  }
})
