import { query, ensureSchema } from './db.js'

const { DUALHOOK_LIVE_KEY } = process.env
// Same Dualhook passthrough of Meta's Graph API used for sending
// (see whatsappSend.js).
const BASE_URL = 'https://api.dualhook.com/v25.0'

// Media retrieval is a two-step Graph API dance: look up the (temporary,
// only valid a few minutes) download URL by media id, then fetch the
// actual bytes from that URL - both calls carry the same Bearer token.
// NOT yet verified against a real payload - WhatsApp isn't receiving real
// traffic yet (see WHATSAPP_FEATURES.md). The shape matches Meta's
// documented Cloud API and Dualhook's proxy is expected to mirror it, but
// may need adjusting once a real image message is seen.
async function downloadFromMeta(mediaId) {
  const lookupRes = await fetch(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${DUALHOOK_LIVE_KEY}` }
  })
  if (!lookupRes.ok) throw new Error(`Media lookup failed (${lookupRes.status})`)
  const { url, mime_type: mimeType } = await lookupRes.json()
  if (!url) throw new Error('Media lookup returned no URL')

  const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${DUALHOOK_LIVE_KEY}` } })
  if (!fileRes.ok) throw new Error(`Media download failed (${fileRes.status})`)
  const buffer = Buffer.from(await fileRes.arrayBuffer())
  return { buffer, mimeType: mimeType || fileRes.headers.get('content-type') || 'application/octet-stream' }
}

// Downloads a WhatsApp media item once and stores it permanently, returning
// the new whatsapp_media row's id - or null if it couldn't be fetched (no
// DUALHOOK_LIVE_KEY configured yet, or the download failed), so the message
// it belongs to still logs with no image rather than failing outright. Not
// awaited by the webhook response (see whatsappRoutes.js) - Meta doesn't
// wait on this.
export async function storeInboundMedia(mediaId) {
  if (!DUALHOOK_LIVE_KEY) {
    console.warn('Skipped downloading WhatsApp media: DUALHOOK_LIVE_KEY not configured yet')
    return null
  }
  await ensureSchema()
  try {
    const { buffer, mimeType } = await downloadFromMeta(mediaId)
    const { rows } = await query(
      'INSERT INTO whatsapp_media (mime_type, data) VALUES ($1, $2) RETURNING id',
      [mimeType, buffer]
    )
    return rows[0].id
  } catch (err) {
    console.error('Failed to download WhatsApp media:', err.message)
    return null
  }
}

export async function getMedia(id) {
  await ensureSchema()
  const { rows } = await query('SELECT mime_type, data FROM whatsapp_media WHERE id = $1', [id])
  const row = rows[0]
  if (!row) return null
  return { mimeType: row.mime_type, data: row.data }
}
