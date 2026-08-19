import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { useAuth } from '../context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'
const HALLS = ['Ashok Palace', 'Convention Center', 'Banquet Hall']
const EMPTY_FORM = {
  title: '', description: '', start: '', end: '', hall: '',
  customerName: '', customerEmail: '', customerMobile: '',
  advancePayment: '', balance: '', paymentDate: '', fullyPaid: false
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: enUS }),
  getDay,
  locales: { 'en-US': enUS }
})

function toLocalInput(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function BookingsCalendar() {
  const { isAdmin, isStaff } = useAuth()
  const canEdit = isAdmin || isStaff

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formMode, setFormMode] = useState(null) // null | 'add' | 'edit'
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingIncomplete, setEditingIncomplete] = useState(false)
  const [paymentLocked, setPaymentLocked] = useState(false)
  const [hallFilter, setHallFilter] = useState('all')
  const modalRef = useRef(null)

  // While the modal is open: lock background scroll and keep keyboard focus
  // (including Tab cycling) inside it.
  useEffect(() => {
    if (!formMode) return

    document.body.style.overflow = 'hidden'
    const modal = modalRef.current
    modal?.querySelector('input')?.focus()

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab' || !modal) return
      const focusable = modal.querySelectorAll('input, button, select, textarea')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [formMode])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/bookings`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load bookings')
      setBookings(await res.json())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const events = useMemo(() => bookings
    .filter((b) => hallFilter === 'all' || b.hall === hallFilter)
    .map((b) => {
      const incomplete = canEdit && b.hasDetails === false
      const label = b.hall ? `${b.hall} — ${b.title}` : b.title
      return {
        id: b.id,
        title: incomplete ? `⚠ ${label}` : label,
        start: new Date(b.start),
        end: new Date(b.end),
        resource: b,
        incomplete
      }
    }), [bookings, canEdit, hallFilter])

  const eventPropGetter = (event) => (
    event.incomplete ? { className: 'rbc-event-incomplete' } : {}
  )

  const openAddForm = (slotInfo) => {
    if (!canEdit) return
    setFormMode('add')
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      start: toLocalInput(slotInfo.start),
      end: toLocalInput(slotInfo.end),
      hall: hallFilter === 'all' ? '' : hallFilter
    })
  }

  const openEditForm = (event) => {
    if (!canEdit) return
    setFormMode('edit')
    setEditingId(event.id)
    setEditingIncomplete(event.resource.hasDetails === false)
    setPaymentLocked(Boolean(event.resource.fullyPaid))
    const b = event.resource
    setForm({
      title: b.title,
      description: b.description,
      start: toLocalInput(event.start),
      end: toLocalInput(event.end),
      hall: b.hall || '',
      customerName: b.customerName || '',
      customerEmail: b.customerEmail || '',
      customerMobile: b.customerMobile || '',
      advancePayment: b.advancePayment || '',
      balance: b.balance || '',
      paymentDate: b.paymentDate || '',
      fullyPaid: Boolean(b.fullyPaid)
    })
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingId(null)
    setEditingIncomplete(false)
    setPaymentLocked(false)
    setForm(EMPTY_FORM)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const payload = {
      title: form.title,
      description: form.description,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      hall: form.hall,
      customerName: form.customerName,
      customerEmail: form.customerEmail,
      customerMobile: form.customerMobile,
      advancePayment: form.advancePayment,
      balance: form.balance,
      paymentDate: form.paymentDate,
      fullyPaid: form.fullyPaid
    }
    try {
      const url = formMode === 'edit' ? `${API_URL}/api/bookings/${editingId}` : `${API_URL}/api/bookings`
      const method = formMode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save booking')
      closeForm()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const cancelBooking = async () => {
    if (!editingId || !window.confirm('Cancel this booking?')) return
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/bookings/${editingId}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to cancel booking')
      closeForm()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="admin-panel booking-panel">
      <h2>Bookings Calendar</h2>
      {canEdit && <p>Click a date/time slot to add a booking, or click an existing booking to edit it.</p>}

      {error && <p className="team-error">{error}</p>}

      <label className="booking-hall-filter">
        Hall
        <select value={hallFilter} onChange={(e) => setHallFilter(e.target.value)}>
          <option value="all">All Halls</option>
          {HALLS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </label>

      {loading ? (
        <p>Loading bookings…</p>
      ) : (
        <div className="booking-calendar-wrap">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
            selectable={canEdit}
            onSelectSlot={openAddForm}
            onSelectEvent={openEditForm}
            eventPropGetter={eventPropGetter}
            popup
          />
        </div>
      )}

      {formMode && (
        <div className="booking-modal-overlay">
          <form ref={modalRef} className="team-form booking-modal" onSubmit={handleSubmit}>
            <button type="button" className="booking-modal-close" onClick={closeForm} aria-label="Close">✕</button>
            <h4>{formMode === 'edit' ? 'Edit Booking' : 'New Booking'}</h4>
            {editingIncomplete && (
              <p className="booking-incomplete-warning">
                ⚠ This booking was created outside the app (likely from a phone's calendar app) and is missing customer/payment details. Please fill them in below.
              </p>
            )}

            <div className="booking-modal-grid">
              <label className="booking-field booking-field-full">
                Title *
                <input
                  required
                  disabled={formMode === 'edit'}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="booking-field booking-field-full">
                Hall *
                <select
                  required
                  value={form.hall}
                  onChange={(e) => setForm({ ...form, hall: e.target.value })}
                >
                  <option value="" disabled>— Select hall —</option>
                  {HALLS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label className="booking-field">
                Start *
                <input
                  type="datetime-local"
                  required
                  disabled={formMode === 'edit'}
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </label>
              <label className="booking-field">
                End *
                <input
                  type="datetime-local"
                  required
                  disabled={formMode === 'edit'}
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </label>
              <label className="booking-field booking-field-full">
                Notes
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              <h5>Customer</h5>
              <label className="booking-field">
                Name *
                <input
                  required
                  disabled={formMode === 'edit'}
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </label>
              <label className="booking-field">
                Email
                <input
                  type="email"
                  disabled={formMode === 'edit'}
                  value={form.customerEmail}
                  onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                />
              </label>
              <label className="booking-field booking-field-full">
                Mobile *
                <input
                  required
                  value={form.customerMobile}
                  onChange={(e) => setForm({ ...form, customerMobile: e.target.value })}
                />
              </label>

              <h5>Payment{paymentLocked && ' · 🔒 locked (fully paid)'}</h5>
              {formMode !== 'edit' && (
                <label className="booking-field booking-field-full">
                  Advance payment *
                  <input
                    type="number"
                    required
                    value={form.advancePayment}
                    onChange={(e) => setForm({ ...form, advancePayment: e.target.value })}
                  />
                </label>
              )}
              <label className="booking-field">
                Balance
                <input
                  type="number"
                  disabled={paymentLocked}
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                />
              </label>
              <label className="booking-checkbox-field">
                <input
                  type="checkbox"
                  disabled={paymentLocked}
                  checked={form.fullyPaid}
                  onChange={(e) => setForm({
                    ...form,
                    fullyPaid: e.target.checked,
                    balance: e.target.checked ? '0' : form.balance
                  })}
                />
                Fully paid
              </label>
              <label className="booking-field booking-field-full">
                Payment date
                <input
                  type="date"
                  disabled={paymentLocked}
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                />
              </label>
            </div>

            <div className="team-actions">
              <button type="submit" className="booking-save-btn">Save</button>
              {formMode === 'edit' && (
                <button type="button" className="booking-cancel-btn" onClick={cancelBooking}>Cancel Booking</button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
