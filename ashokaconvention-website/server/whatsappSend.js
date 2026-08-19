const { DUALHOOK_LIVE_KEY, WHATSAPP_PHONE_NUMBER_ID } = process.env

const BASE_URL = 'https://api.dualhook.com/v25.0'

// Deliberately NOT a hard startup requirement like the other WHATSAPP_* env
// vars - this key doesn't exist yet until it's generated in Dualhook's
// dashboard (Connection -> Overview -> Outbound API key), and a missing
// value here shouldn't crash the entire backend the way those do. Sending
// just no-ops with a warning until it's configured.
export async function sendWhatsAppMessage(phone, text) {
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
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text }
    })
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Dualhook send failed (${res.status}): ${body}`)
  }
}
