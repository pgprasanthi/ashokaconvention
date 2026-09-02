import { useState, useEffect, useCallback } from 'react'
import { fmtDate, fmtAmount, reminderStatusLabel } from '../utils/format'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

export default function PaymentReminders() {
  const [items, setItems] = useState([])
  const [daysBefore, setDaysBefore] = useState(2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The review-and-send modal
  const [active, setActive] = useState(null) // the queue row being sent
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/payment-reminders`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load payment reminders')
      const data = await res.json()
      setItems(data.items)
      setDaysBefore(data.daysBefore)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openSend = (row) => {
    setActive(row)
    setDraft(row.message)
    setError('')
  }
  const closeSend = () => {
    setActive(null)
    setDraft('')
    setSending(false)
  }

  const send = async (e) => {
    e.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/payment-reminders/${encodeURIComponent(active.eventId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: draft })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reminder')
      setItems(data.items)
      setDaysBefore(data.daysBefore)
      if (data.sendStatus === 'failed') {
        setError(`WhatsApp did not accept the message: ${data.error}`)
      } else if (data.sendStatus === 'skipped') {
        setError('Recorded, but not actually sent — WhatsApp sending is not configured on the server yet.')
      } else {
        closeSend()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="admin-panel">
      <h2>Payment Reminders</h2>
      <p>
        Bookings with a balance due within {daysBefore} day{daysBefore === 1 ? '' : 's'}, or already overdue.
        Review the message and send it to the customer on WhatsApp.
      </p>

      {error && !active && <p className="team-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="team-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Event</th>
              <th>Event date</th>
              <th>Due date</th>
              <th>Balance</th>
              <th>Last reminder</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.eventId} className={r.overdue ? 'reminder-overdue' : ''}>
                <td>{r.customerName || '—'}<br /><span className="reminder-sub">{r.customerMobile}</span></td>
                <td>{r.eventName || '—'}<br /><span className="reminder-sub">{r.hall}</span></td>
                <td>{fmtDate(r.bookingDate)}</td>
                <td>{fmtDate(r.paymentDueDate)}{r.overdue && <span className="reminder-badge">Overdue</span>}</td>
                <td>{fmtAmount(r.balance)}</td>
                <td>
                  {r.lastReminder ? (
                    <span title={r.lastReminder.error || ''}>
                      {reminderStatusLabel(r.lastReminder.sendStatus)}
                      <br />
                      <span className="reminder-sub">
                        {new Date(r.lastReminder.sentDate).toLocaleDateString()} · {r.lastReminder.sentBy}
                      </span>
                    </span>
                  ) : '—'}
                </td>
                <td className="team-actions">
                  <button type="button" onClick={() => openSend(r)}>
                    {r.lastReminder ? 'Send again' : 'Review & Send'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="7">No payments due or overdue right now.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {active && (
        <div className="booking-modal-overlay" onClick={closeSend}>
          <form className="team-form booking-modal" onSubmit={send} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="booking-modal-close" onClick={closeSend} aria-label="Close">✕</button>
            <h4>Send payment reminder</h4>
            <p className="reminder-sub">
              To {active.customerName} · {active.customerMobile} · balance {fmtAmount(active.balance)} due {fmtDate(active.paymentDueDate)}
            </p>

            {error && <p className="team-error">{error}</p>}

            <label className="booking-field booking-field-full">
              Message
              <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </label>
            <p className="whatsapp-menu-hint">
              WhatsApp only delivers a free-text message if the customer has messaged you in the last 24 hours.
              Otherwise it needs an approved template — the send will be recorded as failed with the reason.
            </p>

            <div className="team-actions">
              <button type="submit" className="booking-save-btn" disabled={!draft.trim() || sending}>
                {sending ? 'Sending…' : 'Send WhatsApp message'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
