import { query, ensureSchema, dateToISOString } from './db.js'
import { ALL_CHECKS, CHECK_STATUSES, isValidCheckKey, checkPhase } from './checklistTemplate.js'

// Merges the hardcoded template (checklistTemplate.js) with whatever
// responses have been saved for this event. Every template item is always
// returned, in template order, even if it has no row yet ('pending').
//
// pre_full_payment / post_full_payment auto-reflect the event's derived
// `fully_paid` flag: if nobody has explicitly set that item and the booking
// is fully paid, it comes back 'done' (checkedBy 'auto — fully paid'). An
// explicit saved row always wins over the auto value.
export async function getChecklist(eventId) {
  await ensureSchema()
  const [{ rows: checkRows }, { rows: eventRows }] = await Promise.all([
    query('SELECT * FROM event_checks WHERE event_id = $1', [eventId]),
    query('SELECT fully_paid FROM events WHERE event_id = $1', [eventId])
  ])
  const fullyPaid = Boolean(eventRows[0]?.fully_paid)
  const savedByKey = new Map(checkRows.map((r) => [r.item_key, r]))

  const items = ALL_CHECKS.map(({ key, label, phase }) => {
    const saved = savedByKey.get(key)
    if (saved) {
      return {
        key, label, phase,
        status: saved.status,
        notes: saved.notes,
        checkedBy: saved.checked_by,
        checkedDate: dateToISOString(saved.checked_date),
        auto: false
      }
    }
    const autoPaid = fullyPaid && (key === 'pre_full_payment' || key === 'post_full_payment')
    return {
      key, label, phase,
      status: autoPaid ? 'done' : 'pending',
      notes: '',
      checkedBy: autoPaid ? 'auto — fully paid' : '',
      checkedDate: '',
      auto: autoPaid
    }
  })

  const summary = { pre: { done: 0, total: 0 }, post: { done: 0, total: 0 } }
  for (const item of items) {
    const s = summary[item.phase]
    if (!s) continue
    s.total += 1
    // 'na' counts as resolved for the progress figure - it's a deliberate
    // decision, not an outstanding task.
    if (item.status === 'done' || item.status === 'na') s.done += 1
  }

  return { items, summary }
}

// items: [{ key, status, notes }]. Invalid keys/statuses are rejected (400
// via the route). Each item is upserted keyed on (event_id, item_key);
// checked_by/checked_date are stamped on every write.
export async function saveChecks(eventId, items, actor) {
  await ensureSchema()
  if (!Array.isArray(items)) throw badRequest('items must be an array')

  for (const item of items) {
    if (!item || !isValidCheckKey(item.key)) throw badRequest(`unknown checklist item: ${item?.key}`)
    if (!CHECK_STATUSES.includes(item.status)) throw badRequest(`invalid status: ${item?.status}`)
  }

  const now = new Date().toISOString()
  for (const item of items) {
    await query(
      `INSERT INTO event_checks (event_id, phase, item_key, status, notes, checked_by, checked_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id, item_key)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes,
                     checked_by = EXCLUDED.checked_by, checked_date = EXCLUDED.checked_date,
                     phase = EXCLUDED.phase`,
      [eventId, checkPhase(item.key), item.key, item.status, item.notes || '', actor, now]
    )
  }

  return getChecklist(eventId)
}

function badRequest(message) {
  const err = new Error(message)
  err.code = 'BAD_REQUEST'
  return err
}
