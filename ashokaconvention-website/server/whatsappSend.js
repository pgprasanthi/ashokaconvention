const { DUALHOOK_LIVE_KEY, WHATSAPP_PHONE_NUMBER_ID } = process.env

const BASE_URL = 'https://api.dualhook.com/v25.0'

// Callers that record a send outcome (e.g. payment reminders) use this to
// tell "genuinely delivered" apart from "no-op'd because the key isn't set
// yet" - sendPayload silently returns in the latter case rather than erroring.
export function isWhatsAppConfigured() {
  return Boolean(DUALHOOK_LIVE_KEY)
}

// Deliberately NOT a hard startup requirement like the other WHATSAPP_* env
// vars - this key doesn't exist yet until it's generated in Dualhook's
// dashboard (Connection -> Overview -> Outbound API key), and a missing
// value here shouldn't crash the entire backend the way those do. Sending
// just no-ops with a warning until it's configured.
async function sendPayload(payload) {
  if (!DUALHOOK_LIVE_KEY) {
    console.warn('Skipped sending WhatsApp message: DUALHOOK_LIVE_KEY not configured yet')
    return
  }

  const res = await fetch(`${BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DUALHOOK_LIVE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Dualhook send failed (${res.status}): ${body}`)
  }
}

export async function sendWhatsAppMessage(phone, text) {
  await sendPayload({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } })
}

// WhatsApp's native quick-reply buttons - max 3 per message, each title
// capped at 20 characters by the Cloud API. The tap comes back on the
// webhook as an "interactive" message with interactive.button_reply.id
// matching whatever id was sent here.
export async function sendWhatsAppButtons(phone, bodyText, buttons) {
  await sendPayload({
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map(({ id, title }) => ({ type: 'reply', reply: { id, title } })) }
    }
  })
}
