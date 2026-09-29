import { query, ensureSchema, dateToISOString } from './db.js'

function rowToMessage(row) {
  return {
    id: row.id,
    phone: row.phone,
    direction: row.direction,
    text: row.body,
    // '' for a plain text message; 'image' when it carries an attachment -
    // mediaId then points at the stored whatsapp_media row, served through
    // GET /api/whatsapp-media/:id (see whatsappMediaRoutes.js).
    mediaType: row.media_type || '',
    mediaId: row.media_id || null,
    createdDate: dateToISOString(row.created_date)
  }
}

// direction is 'in' (customer -> business) or 'out' (business -> customer,
// whether an auto-reply or a staff reply echoed back from the WhatsApp
// Business app). Fire-and-forget from callers' perspective - a message that
// fails to log doesn't fail the send/receive it's attached to. `media`, if
// given, is `{ id, type }` for an already-downloaded attachment (see
// whatsappMedia.js) - omitted for a plain text message.
export async function logMessage(phone, direction, text, media) {
  await ensureSchema()
  await query(
    'INSERT INTO whatsapp_messages (phone, direction, body, media_type, media_id) VALUES ($1, $2, $3, $4, $5)',
    [phone, direction, text || '', media?.type || '', media?.id || null]
  )
}

// Same loose phone-matching as whatsappLeads.js, so a number typed/stored
// with different formatting (spaces, +91, etc.) still resolves to one thread.
export async function listMessages(phone) {
  await ensureSchema()
  const { rows } = await query(
    `SELECT * FROM whatsapp_messages
     WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10)
     ORDER BY created_date ASC`,
    [phone]
  )
  return rows.map(rowToMessage)
}
