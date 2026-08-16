import { Router } from 'express'
import crypto from 'crypto'

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

// Actual incoming message/status events land here. For now this just logs
// them - storage and the Inbox UI are a follow-up once the connection is
// confirmed working end to end.
whatsappRouter.post('/', (req, res) => {
  if (!isValidSignature(req)) return res.sendStatus(401)

  console.log('WhatsApp webhook event:', JSON.stringify(req.body, null, 2))
  res.sendStatus(200)
})
