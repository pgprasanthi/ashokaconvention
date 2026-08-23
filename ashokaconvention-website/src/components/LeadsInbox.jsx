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

  const [messagesPhone, setMessagesPhone] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Filters by First Message date - blank means no bound on that side, so
  // leaving both empty shows every lead (the default, unfiltered view).
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const filteredLeads = leads.filter((l) => {
    const day = (l.firstMessage || '').slice(0, 10)
    if (dateStart && day < dateStart) return false
    if (dateEnd && day > dateEnd) return false
    return true
  })

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

  const openMessages = async (phone) => {
    setMessagesPhone(phone)
    setMessagesLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/leads/${encodeURIComponent(phone)}/messages`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load messages')
      setMessages(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setMessagesLoading(false)
    }
  }

  const closeMessages = () => {
    setMessagesPhone(null)
    setMessages([])
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

      <div className="booking-toolbar">
        <label className="booking-hall-filter">
          From
          <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </label>
        <label className="booking-hall-filter">
          To
          <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </label>
        {(dateStart || dateEnd) && (
          <button type="button" className="booking-neutral-btn" onClick={() => { setDateStart(''); setDateEnd('') }}>
            Clear dates
          </button>
        )}
      </div>

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
            {filteredLeads.map((l) => (
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
                  <button type="button" className="booking-neutral-btn" onClick={() => openMessages(l.phone)}>View Messages</button>
                  {!l.assignedTo && (
                    <button onClick={() => assignToMe(l.phone)}>Assign to me</button>
                  )}
                  {l.assignedTo === user?.email && l.status !== 'lost' && (
                    <button onClick={() => openLostModal(l.phone)}>Mark Not Closed</button>
                  )}
                </td>
              </tr>
            ))}
            {filteredLeads.length === 0 && (
              <tr><td colSpan="8">{leads.length === 0 ? 'No WhatsApp leads yet.' : 'No leads in this date range.'}</td></tr>
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

      {messagesPhone && (
        <div className="booking-modal-overlay">
          <div className="team-form booking-modal">
            <button type="button" className="booking-modal-close" onClick={closeMessages} aria-label="Close">✕</button>
            <h4>Conversation — {messagesPhone}</h4>
            {messagesLoading ? (
              <p>Loading messages…</p>
            ) : messages.length === 0 ? (
              <p>No messages logged for this number yet.</p>
            ) : (
              <div className="wa-thread">
                {messages.map((m) => (
                  <div key={m.id} className={`wa-bubble ${m.direction}`}>
                    <p>{m.text || <em>(no text)</em>}</p>
                    <span>{new Date(m.createdDate).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
