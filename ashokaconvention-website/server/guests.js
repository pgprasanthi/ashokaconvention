import { query, ensureSchema, dateToISOString } from './db.js'

function rowToGuest(row) {
  return { email: row.email, name: row.name, firstSeen: dateToISOString(row.first_seen), lastSeen: dateToISOString(row.last_seen) }
}

export async function listGuests() {
  await ensureSchema()
  const { rows } = await query('SELECT * FROM guests ORDER BY id ASC')
  return rows.map(rowToGuest)
}

// Called on every guest sign-in. Adds a new row the first time, otherwise
// just bumps "Last Sign-In" on their existing row.
export async function recordGuestSignIn({ email, name }) {
  await ensureSchema()
  const normalizedEmail = email.toLowerCase()
  const now = new Date().toISOString()
  await query(
    `INSERT INTO guests (email, name, first_seen, last_seen) VALUES ($1, $2, $3, $3)
     ON CONFLICT (email) DO UPDATE SET last_seen = $3`,
    [normalizedEmail, name || '', now]
  )
}
