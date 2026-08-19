import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

const LOST_REASONS = [
  'Budget mismatch',
  'Chose another venue',
  'Date unavailable',
  'No response from customer',
  'Other'
]

export default function LeadsInbox() {
  const { user } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [lostModalPhone, setLostModalPhone] = useState(null)
  const [lostCategory, setLostCategory] = useState(LOST_REASONS[0])
  const [lostCustomReason, setLostCustomReason] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/leads`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load leads')
      setLeads(await res.json())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const assignToMe = async (phone) => {
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/leads/${encodeURIComponent(phone)}/assign`, {
        method: 'PUT',
        credentials: 'include'
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to assign lead')
      setLeads(await res.json())
    } catch (err) {
      setError(err.message)
    }
  }

  const openLostModal = (phone) => {
    setLostModalPhone(phone)
    setLostCategory(LOST_REASONS[0])
    setLostCustomReason('')
  }

  const closeLostModal = () => {
    setLostModalPhone(null)
    setLostCategory(LOST_REASONS[0])
    setLostCustomReason('')
  }

  const confirmMarkNotClosed = async (e) => {
    e.preventDefault()
    const reason = lostCategory === 'Other' ? lostCustomReason.trim() : lostCategory
    if (!reason) return

    setError('')
    try {
      const res = await fetch(`${API_URL}/api/leads/${encodeURIComponent(lostModalPhone)}/lost`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update lead')
      setLeads(await res.json())
      closeLostModal()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="admin-panel">
      <h2>WhatsApp Leads</h2>
      <p>Inquiries that reached out via WhatsApp. Assign one to yourself to start following up.</p>

      {error && <p className="team-error">{error}</p>}

      {loading ? (
        <p>Loading leads…</p>
      ) : (
        <table className="team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>First Message</th>
              <th>Messages</th>
              <th>Ad Source</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.phone}>
                <td>{l.name || '—'}</td>
                <td>{l.phone}</td>
                <td>{new Date(l.firstMessage).toLocaleDateString()}</td>
                <td>{l.messageCount}</td>
                <td>{l.adSource || '—'}</td>
                <td>{l.assignedTo || '—'}</td>
                <td>
                  {l.status === 'lost' ? (
                    <span title={l.lostReason}>Not closed</span>
                  ) : 'Open'}
                </td>
                <td className="team-actions">
                  {!l.assignedTo && (
                    <button onClick={() => assignToMe(l.phone)}>Assign to me</button>
                  )}
                  {l.assignedTo === user?.email && l.status !== 'lost' && (
                    <button onClick={() => openLostModal(l.phone)}>Mark Not Closed</button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr><td colSpan="8">No WhatsApp leads yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {lostModalPhone && (
        <div className="booking-modal-overlay">
          <form className="team-form booking-modal" onSubmit={confirmMarkNotClosed}>
            <button type="button" className="booking-modal-close" onClick={closeLostModal} aria-label="Close">✕</button>
            <h4>Mark Not Closed</h4>
            <p className="booking-incomplete-warning">
              ⚠ Make sure you've sent a proper closing message to the customer on WhatsApp before confirming.
            </p>

            <label className="booking-field">
              Reason
              <select value={lostCategory} onChange={(e) => setLostCategory(e.target.value)}>
                {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>

            {lostCategory === 'Other' && (
              <label className="booking-field">
                Please specify
                <input
                  required
                  value={lostCustomReason}
                  onChange={(e) => setLostCustomReason(e.target.value)}
                />
              </label>
            )}

            <div className="team-actions">
              <button type="submit" className="booking-cancel-btn">Confirm Not Closed</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
