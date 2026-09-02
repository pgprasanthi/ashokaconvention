import { useState, useEffect } from 'react'
import { fmtDate, fmtAmount, reminderStatusLabel } from '../utils/format'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

const PREVIEW_COUNT = 6

// Read-only snapshot of the payment-reminder queue for the Admin page. The
// actual review-and-send flow lives on the Payments page (onNavigate).
export default function DuePaymentsSummary({ onNavigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/payment-reminders`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load payments due')
        const data = await res.json()
        setItems(data.items)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const overdue = items.filter((i) => i.overdue).length
  const dueSoon = items.length - overdue

  return (
    <>
      <hr className="admin-divider" />
      <h3>Payments due</h3>

      {error && <p className="team-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No payments due or overdue right now.</p>
      ) : (
        <>
          <p>
            <strong>{overdue}</strong> overdue · <strong>{dueSoon}</strong> due soon
          </p>
          <table className="team-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Event</th>
                <th>Due date</th>
                <th>Balance</th>
                <th>Reminder</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, PREVIEW_COUNT).map((r) => (
                <tr key={r.eventId} className={r.overdue ? 'reminder-overdue' : ''}>
                  <td>{r.customerName || '—'}<br /><span className="reminder-sub">{r.customerMobile}</span></td>
                  <td>{r.eventName || '—'}<br /><span className="reminder-sub">{r.hall}</span></td>
                  <td>{fmtDate(r.paymentDueDate)}{r.overdue && <span className="reminder-badge">Overdue</span>}</td>
                  <td>{fmtAmount(r.balance)}</td>
                  <td>{r.lastReminder ? reminderStatusLabel(r.lastReminder.sendStatus) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > PREVIEW_COUNT && (
            <p className="reminder-sub">+ {items.length - PREVIEW_COUNT} more</p>
          )}
        </>
      )}

      {onNavigate && (
        <div className="team-actions">
          <button type="button" className="booking-neutral-btn" onClick={() => onNavigate('payments')}>
            Open Payments page →
          </button>
        </div>
      )}
    </>
  )
}
