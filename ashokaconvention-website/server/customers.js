// Customers table access. mobile+name is the de-dupe key (not mobile
// alone) - a shared family phone number booking under different names is
// treated as different customers, matching the unique index on
// customers(mobile, name) in db.js.

function normalize(v) {
  return (v || '').trim()
}

// Finds the existing customer for this mobile+name, or creates one. Called
// inside the same transaction as the event/payment insert (see events.js)
// so a booking never ends up with no customer row behind it. Blank
// email/address on an existing row get filled in from this booking, never
// overwritten if already set - same behavior as the migration backfill.
export async function findOrCreateCustomer(client, { name, email, mobile, address }) {
  const normName = normalize(name)
  const normMobile = normalize(mobile)

  const { rows: existing } = await client.query(
    'SELECT id FROM customers WHERE mobile = $1 AND name = $2',
    [normMobile, normName]
  )
  if (existing.length) {
    const customerId = existing[0].id
    await client.query(
      `UPDATE customers SET
         email = CASE WHEN email = '' THEN $1 ELSE email END,
         address = CASE WHEN address = '' THEN $2 ELSE address END,
         updated_date = now()
       WHERE id = $3`,
      [email || '', address || '', customerId]
    )
    return customerId
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO customers (name, email, mobile, address) VALUES ($1, $2, $3, $4) RETURNING id`,
    [normName, email || '', normMobile, address || '']
  )
  return inserted[0].id
}
