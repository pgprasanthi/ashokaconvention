import { toNullIfBlank } from './db.js'

// Balance is always derived, never entered directly - keeps it impossible
// for the two to drift out of sync regardless of how a request is made
// (UI, or a direct API call). Blank if either side of the sum is unknown.
function computeBalance(committedAmount, amountPaid) {
  const committed = Number(committedAmount)
  const paid = Number(amountPaid)
  if (!Number.isFinite(committed) || !Number.isFinite(paid)) return ''
  return String(committed - paid)
}

// fullyPaid is likewise derived, not a manually-set flag - it's true exactly
// when the balance hits zero, never toggled directly by a caller.
function computeFullyPaid(committedAmount, amountPaid) {
  const balance = computeBalance(committedAmount, amountPaid)
  return balance !== '' && Number(balance) === 0
}

function rowToPayment(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    customerId: row.customer_id,
    paymentType: row.payment_type,
    committedAmount: row.committed_amount ?? '',
    amountPaid: row.amount_paid ?? '',
    balance: row.balance ?? '',
    fullyPaid: row.fully_paid,
    paymentDate: row.payment_date || '',
    paymentDueDate: row.payment_due_date || '',
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  }
}

export async function listPaymentsForEvent(query, eventId) {
  const { rows } = await query('SELECT * FROM payments WHERE event_id = $1 ORDER BY id ASC', [eventId])
  return rows.map(rowToPayment)
}

// Batch form of the above, for listing many events at once (avoids an N+1
// query per booking) - returns a Map of eventId -> that event's payments.
export async function listPaymentsForEvents(query, eventIds) {
  const map = new Map(eventIds.map((id) => [id, []]))
  if (!eventIds.length) return map
  const { rows } = await query(
    'SELECT * FROM payments WHERE event_id = ANY($1) ORDER BY event_id, id ASC',
    [eventIds]
  )
  for (const row of rows) {
    map.get(row.event_id)?.push(rowToPayment(row))
  }
  return map
}

// Creates or updates the one (event, paymentType) line item, inside the
// caller's transaction. amountPaid/committedAmount are the new CUMULATIVE
// totals for this type (same contract the old single-payment events.js
// used) - balance/fullyPaid are always derived here, never trusted from the
// caller. Once a line item is fully paid its payment fields lock - a caller
// can still touch other payment types on the same event, but changes to a
// locked type are silently ignored rather than applied, enforced here so it
// can't be bypassed by calling the API directly.
export async function upsertPayment(client, {
  eventId, customerId, paymentType, committedAmount, amountPaid, paymentDate, paymentDueDate, notes, actor
}) {
  const { rows } = await client.query(
    'SELECT * FROM payments WHERE event_id = $1 AND payment_type = $2',
    [eventId, paymentType]
  )
  const existing = rows[0] ? rowToPayment(rows[0]) : null
  const locked = Boolean(existing?.fullyPaid)

  const mergedCommitted = locked ? existing.committedAmount : (committedAmount ?? existing?.committedAmount ?? '')
  const mergedPaid = locked ? existing.amountPaid : (amountPaid ?? existing?.amountPaid ?? '')
  const mergedDate = locked ? existing.paymentDate : (paymentDate ?? existing?.paymentDate ?? '')
  const mergedDueDate = locked ? existing.paymentDueDate : (paymentDueDate ?? existing?.paymentDueDate ?? '')
  const mergedNotes = notes ?? existing?.notes ?? ''
  const balance = locked ? existing.balance : computeBalance(mergedCommitted, mergedPaid)
  const fullyPaid = locked ? existing.fullyPaid : computeFullyPaid(mergedCommitted, mergedPaid)

  await client.query(
    `INSERT INTO payments (
       event_id, customer_id, payment_type, committed_amount, amount_paid, balance, fully_paid,
       payment_date, payment_due_date, notes, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (event_id, payment_type) DO UPDATE SET
       committed_amount = EXCLUDED.committed_amount,
       amount_paid = EXCLUDED.amount_paid,
       balance = EXCLUDED.balance,
       fully_paid = EXCLUDED.fully_paid,
       payment_date = EXCLUDED.payment_date,
       payment_due_date = EXCLUDED.payment_due_date,
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_date = now()`,
    [
      eventId, customerId, paymentType, toNullIfBlank(mergedCommitted), toNullIfBlank(mergedPaid),
      toNullIfBlank(balance), Boolean(fullyPaid), toNullIfBlank(mergedDate), toNullIfBlank(mergedDueDate),
      mergedNotes || '', actor
    ]
  )

  return {
    eventId, customerId, paymentType, committedAmount: mergedCommitted, amountPaid: mergedPaid,
    balance, fullyPaid: Boolean(fullyPaid), paymentDate: mergedDate, paymentDueDate: mergedDueDate,
    notes: mergedNotes, createdBy: existing?.createdBy || actor, updatedBy: actor
  }
}
