import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

export default function GuestsList() {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/guests`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load guests')
        setGuests(await res.json())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="guests-list">
      <h3>Guests</h3>
      <p>Anyone who has signed in without being staff or admin. Read-only — kept separate from staff records.</p>

      {error && <p className="team-error">{error}</p>}

      {loading ? (
        <p>Loading guests…</p>
      ) : (
        <table className="team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>First Signed In</th>
              <th>Last Signed In</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.email}>
                <td>{g.name}</td>
                <td>{g.email}</td>
                <td>{new Date(g.firstSeen).toLocaleString()}</td>
                <td>{new Date(g.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
            {guests.length === 0 && (
              <tr><td colSpan="4">No guests have signed in yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
