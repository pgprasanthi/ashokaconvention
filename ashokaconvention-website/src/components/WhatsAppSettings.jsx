import { useState, useEffect } from 'react'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

const EMPTY_FORM = {
  whatsapp_greeting_enabled: false,
  whatsapp_greeting_text: '',
  whatsapp_away_enabled: false,
  whatsapp_away_text: ''
}

export default function WhatsAppSettings() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load settings')
        const data = await res.json()
        setForm({
          whatsapp_greeting_enabled: data.whatsapp_greeting_enabled === 'TRUE',
          whatsapp_greeting_text: data.whatsapp_greeting_text || '',
          whatsapp_away_enabled: data.whatsapp_away_enabled === 'TRUE',
          whatsapp_away_text: data.whatsapp_away_text || ''
        })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save settings')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="admin-panel"><p>Loading settings…</p></section>

  return (
    <section className="admin-panel">
      <h2>WhatsApp Auto Messages</h2>
      <p>
        Automatic replies sent from the business number via the Cloud API. Keep WhatsApp's own
        built-in Greeting/Away message (in the Business App's Business tools menu) turned <strong>off</strong> while
        these are enabled, so customers don't get a duplicate reply.
      </p>

      {error && <p className="team-error">{error}</p>}
      {saved && <p className="team-success">Settings saved.</p>}

      <form className="team-form settings-form" onSubmit={handleSubmit}>
        <label className="booking-checkbox-field">
          <input
            type="checkbox"
            checked={form.whatsapp_greeting_enabled}
            onChange={(e) => setForm({ ...form, whatsapp_greeting_enabled: e.target.checked })}
          />
          Send a greeting message to first-time contacts
        </label>
        <label className="booking-field booking-field-full">
          Greeting message
          <textarea
            rows={3}
            placeholder="Thanks for reaching out to Ashoka Convention! We'll get back to you shortly."
            value={form.whatsapp_greeting_text}
            onChange={(e) => setForm({ ...form, whatsapp_greeting_text: e.target.value })}
          />
        </label>

        <hr className="admin-divider" />

        <label className="booking-checkbox-field">
          <input
            type="checkbox"
            checked={form.whatsapp_away_enabled}
            onChange={(e) => setForm({ ...form, whatsapp_away_enabled: e.target.checked })}
          />
          Send an away message (sent once, then stays quiet for 24 hours per contact)
        </label>
        <label className="booking-field booking-field-full">
          Away message
          <textarea
            rows={3}
            placeholder="Our team is currently away. We'll respond as soon as possible."
            value={form.whatsapp_away_text}
            onChange={(e) => setForm({ ...form, whatsapp_away_text: e.target.value })}
          />
        </label>

        <div className="team-actions">
          <button type="submit" className="booking-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
