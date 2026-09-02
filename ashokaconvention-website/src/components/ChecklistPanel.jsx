import { useState, useEffect, useMemo, useCallback } from 'react'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
  { value: 'na', label: 'N/A' }
]
const PHASES = [
  { id: 'pre', title: 'Pre-event' },
  { id: 'post', title: 'Post-event' }
]

// key -> { status, notes }, the shape Save sends. Kept minimal so the dirty
// check and payload are the same thing.
function toDraft(items) {
  const draft = {}
  for (const it of items) draft[it.key] = { status: it.status, notes: it.notes || '' }
  return draft
}

export default function ChecklistPanel({ eventId, eventStart }) {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ pre: { done: 0, total: 0 }, post: { done: 0, total: 0 } })
  const [draft, setDraft] = useState({})
  const [original, setOriginal] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Past events open on the post-event group, upcoming ones on pre-event.
  const eventPassed = eventStart ? new Date(eventStart) < new Date(new Date().toDateString()) : false
  const [open, setOpen] = useState(() => ({ pre: !eventPassed, post: eventPassed }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/bookings/${eventId}/checklist`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load checklist')
      const data = await res.json()
      setItems(data.items)
      setSummary(data.summary)
      const d = toDraft(data.items)
      setDraft(d)
      setOriginal(d)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(original),
    [draft, original]
  )

  const setField = (key, patch) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  }

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    setError('')
    // Only send what actually changed - keeps checked_by/checked_date on
    // untouched rows intact.
    const changed = Object.entries(draft)
      .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(original[k]))
      .map(([key, v]) => ({ key, status: v.status, notes: v.notes }))
    try {
      const res = await fetch(`${API_URL}/api/bookings/${eventId}/checklist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: changed })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save checklist')
      const data = await res.json()
      setItems(data.items)
      setSummary(data.summary)
      const d = toDraft(data.items)
      setDraft(d)
      setOriginal(d)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="checklist-loading">Loading checklist…</p>

  return (
    <div className="checklist-panel">
      {error && <p className="team-error">{error}</p>}

      {PHASES.map((phase) => {
        const phaseItems = items.filter((it) => it.phase === phase.id)
        const s = summary[phase.id] || { done: 0, total: 0 }
        return (
          <div key={phase.id} className="checklist-group">
            <button
              type="button"
              className="checklist-group-header"
              onClick={() => setOpen((o) => ({ ...o, [phase.id]: !o[phase.id] }))}
            >
              <span>{open[phase.id] ? '▾' : '▸'} {phase.title}</span>
              <span className={`checklist-progress${s.done === s.total ? ' complete' : ''}`}>
                {s.done}/{s.total}
              </span>
            </button>

            {open[phase.id] && (
              <ul className="checklist-items">
                {phaseItems.map((it) => {
                  const row = draft[it.key] || { status: 'pending', notes: '' }
                  return (
                    <li key={it.key} className={`checklist-row status-${row.status}`}>
                      <div className="checklist-row-main">
                        <span className="checklist-label">{it.label}</span>
                        <select
                          className="checklist-status"
                          value={row.status}
                          onChange={(e) => setField(it.key, { status: e.target.value })}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="checklist-note"
                        placeholder="Note (optional)"
                        value={row.notes}
                        onChange={(e) => setField(it.key, { notes: e.target.value })}
                      />
                      {it.checkedBy && (
                        <p className="checklist-meta">
                          {it.checkedBy}
                          {it.checkedDate ? ` · ${new Date(it.checkedDate).toLocaleDateString()}` : ''}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      <div className="team-actions">
        <button
          type="button"
          className="booking-save-btn"
          onClick={save}
          disabled={!isDirty || saving}
          title={!isDirty ? 'No changes to save yet' : undefined}
        >
          {saving ? 'Saving…' : 'Save checklist'}
        </button>
      </div>
    </div>
  )
}
