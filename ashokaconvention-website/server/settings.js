import { query, ensureSchema } from './db.js'

// Returns every setting as a flat { key: value } object. Callers apply their
// own defaults for keys that aren't present yet.
export async function getSettings() {
  await ensureSchema()
  const { rows } = await query('SELECT key, value FROM settings')
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// Upserts one or more key-value pairs in a single batch.
export async function updateSettings(updates) {
  await ensureSchema()
  const entries = Object.entries(updates)
  if (entries.length) {
    const values = entries.map(([key, value]) => [key, value])
    const placeholders = values.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
    await query(
      `INSERT INTO settings (key, value) VALUES ${placeholders}
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      values.flat()
    )
  }
  return getSettings()
}
