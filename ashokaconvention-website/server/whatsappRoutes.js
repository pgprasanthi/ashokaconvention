import { Router } from 'express'
import crypto from 'crypto'
import { recordLead, recordOutboundMessage } from './whatsappLeads.js'

const { WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_APP_SECRET } = process.env

if (!WHATSAPP_WEBHOOK_VERIFY_TOKEN || !WHATSAPP_APP_SECRET) {
  throw new Error('WHATSAPP_WEBHOOK_VERIFY_TOKEN and WHATSAPP_APP_SECRET must be set (see server/.env.example)')
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

// Meta signs every webhook POST body with your app secret - verifying this
// stops anyone else from sending fake messages to this public endpoint.
function isValidSignature(req) {
  const signature = req.get('X-Hub-Signature-256')
  if (!signature || !req.rawBody) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// Outbound replies staff send from the WhatsApp Business app (Coexistence
// mode) are delivered back to the webhook as "echo" events, separate from
// inbound customer messages. NOTE: the exact field name/shape here is a
// best guess based on available docs ("smb_message_echoes") - this hasn't
// been verified against a real payload yet since the Meta connection isn't
// live. May need adjusting once real echo events are seen.
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
  // Temporary diagnostic: logs every POST that reaches this route, even ones
  // that fail signature verification below - a failed-signature request
  // previously returned 401 with zero log output, indistinguishable from a
  // request that never arrived at all. Remove once the Dualhook connection
  // issue is confirmed resolved.
  console.log('WhatsApp webhook POST received. Has signature header:', Boolean(req.get('X-Hub-Signature-256')), 'Signature valid:', isValidSignature(req))

  if (!isValidSignature(req)) return res.sendStatus(401)
  res.sendStatus(200)

  console.log('WhatsApp webhook event:', JSON.stringify(req.body, null, 2))
  for (const { phone, name, adSource } of extractMessages(req.body)) {
    recordLead({ phone, name, adSource }).catch((err) => {
      console.error('Failed to record WhatsApp lead:', err.message)
    })
  }
  for (const { phone } of extractOutboundEchoes(req.body)) {
    recordOutboundMessage(phone).catch((err) => {
      console.error('Failed to record outbound WhatsApp message:', err.message)
    })
  }
})
