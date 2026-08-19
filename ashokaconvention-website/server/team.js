import { query, ensureSchema } from './db.js'

const { TEAM_CACHE_TTL_MS = 5 * 60 * 1000 } = process.env

let cache = { members: [], fetchedAt: 0 }

function rowToMember(row) {
  return {
    email: row.email,
    role: row.role,
    name: row.name,
    joinedOn: row.joined_on,
    mobile: row.mobile
  }
}

async function fetchMembers({ force = false } = {}) {
  const isStale = force || Date.now() - cache.fetchedAt > Number(TEAM_CACHE_TTL_MS)
  if (!isStale) return cache.members

  await ensureSchema()
  const { rows } = await query('SELECT * FROM team_members ORDER BY id ASC')
  const members = rows.map(rowToMember)
  cache = { members, fetchedAt: Date.now() }
  return members
}

// Looks up a role from the cached team list, refreshing it once the TTL
// expires. If a refresh fails (db unreachable, etc), keeps serving the last
// known list rather than locking everyone out.
export async function getRole(email) {
  let members
  try {
    members = await fetchMembers()
  } catch (err) {
    console.error('Failed to refresh team list from the database, using last known list:', err.message)
    if (cache.fetchedAt === 0) throw err
    members = cache.members
  }
  return members.find((m) => m.email === email.toLowerCase())?.role || 'guest'
}

// Admin/staff only - guests aren't listed here.
export async function listTeam() {
  const members = await fetchMembers()
  return members.filter((m) => m.role === 'admin' || m.role === 'staff')
}

export async function addTeamMember({ email, role, name, joinedOn, mobile }) {
  await ensureSchema()
  await query(
    'INSERT INTO team_members (email, role, name, joined_on, mobile) VALUES ($1, $2, $3, $4, $5)',
    [email.trim().toLowerCase(), role, name, joinedOn, mobile]
  )
  await fetchMembers({ force: true })
}

export async function updateTeamMember(email, updates) {
  const members = await fetchMembers({ force: true })
  const existing = members.find((m) => m.email === email.toLowerCase())
  if (!existing) throw new Error('Team member not found')

  const merged = { ...existing, ...updates }
  await query(
    'UPDATE team_members SET email = $1, role = $2, name = $3, joined_on = $4, mobile = $5 WHERE email = $6',
    [merged.email.trim().toLowerCase(), merged.role, merged.name, merged.joinedOn, merged.mobile, email.toLowerCase()]
  )
  await fetchMembers({ force: true })
}

export async function removeTeamMember(email) {
  const members = await fetchMembers({ force: true })
  const existing = members.find((m) => m.email === email.toLowerCase())
  if (!existing) throw new Error('Team member not found')

  await query('DELETE FROM team_members WHERE email = $1', [email.toLowerCase()])
  await fetchMembers({ force: true })
}
