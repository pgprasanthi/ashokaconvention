import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { useAuth } from '../context/AuthContext'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')
// Toggle back on once cancellation is ready to be allowed again.
const CANCELLATION_ENABLED = false
const HALLS = ['Ashok Palace', 'Convention Center', 'Banquet Hall']
const EVENT_TYPES = ['Wedding', 'Engagement', 'Birthday', 'Reception', 'Corporate Event', 'Anniversary', 'Other']
const EMPTY_FORM = {
  title: '', description: '', start: '', end: '', hall: '', eventType: '',
  customerName: '', customerEmail: '', customerMobile: '', customerAddress: '',
  referredBy: '', guestCount: '', closedBy: '',
  amountPaid: '', paymentDate: '', committedAmount: '', paymentDueDate: ''
}

const STEPS = [
  { id: 'event', label: '1. Event' },
  { id: 'customer', label: '2. Customer' },
  { id: 'payment', label: '3. Payment' }
]

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

// YYYY-MM-DD, what a native <input type="date"> expects as its value.
function todayISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Strips anything typed/pasted that isn't a digit, so the mobile field can
// never hold letters or symbols - capped at 10 since that's a valid Indian
// mobile number's full length.
function digitsOnly(value) {
  return value.replace(/\D/g, '').slice(0, 10)
}

// Same idea for amount fields - keeps digits and a single decimal point,
// blocking letters/symbols as they're typed rather than only at submit time.
function numericOnly(value) {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
}

// Compares calendar dates only (not time-of-day) - an event happening later
// today is still editable, only ones from a day that's already passed count.
function isPastDate(date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return day < today
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
  const [pastBooking, setPastBooking] = useState(false)
  const [hallFilter, setHallFilter] = useState('all')
  const [currentStep, setCurrentStep] = useState(0)
  // Edit mode only: how much the customer is paying in THIS visit, separate
  // from form.amountPaid (which holds the running cumulative total already
  // on record) - the two get added together on save. New bookings don't use
  // this at all, since the first payment IS the cumulative total.
  const [paymentIncrement, setPaymentIncrement] = useState('')
  // Snapshot of the form exactly as it was when the modal opened, so Save
  // can be disabled until something actually differs from it - and a
  // separate in-flight flag, so rapid re-clicking can't fire duplicate
  // saves even when there IS a real change (each one was creating its own
  // event_history row).
  const [originalForm, setOriginalForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const modalRef = useRef(null)

  const isDirty = paymentIncrement !== '' || JSON.stringify(form) !== JSON.stringify(originalForm)

  // Which step a given required field lives on, so a missing field can
  // point the user at the right step instead of just a generic error.
  const stepIsValid = (step) => {
    if (step === 0) return form.title && form.hall && form.start && form.end
    if (step === 1) return form.customerName && form.customerMobile
    if (step === 2) return (formMode === 'edit' && !editingIncomplete) || form.amountPaid
    return true
  }

  // In edit mode, the amount that will actually get saved is the existing
  // total plus whatever's being paid in this visit - previewing with that
  // combined figure keeps Balance/Fully paid accurate before Save is clicked.
  const effectiveAmountPaid = formMode === 'edit'
    ? String(Number(form.amountPaid || 0) + Number(paymentIncrement || 0))
    : form.amountPaid

  // Both derived the same way the backend derives them - never set
  // directly, so the "fully paid" state can't drift from the numbers or be
  // toggled by hand.
  const computedBalance = form.committedAmount !== '' && effectiveAmountPaid !== ''
    ? Number(form.committedAmount) - Number(effectiveAmountPaid)
    : null
  const isFullyPaid = computedBalance === 0

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
      // Falls back to the booking title when there's no customer name yet
      // (guests only ever see "Blocked" as the title; an incomplete booking
      // created outside the app has no customer name until filled in).
      const customerLabel = b.customerName || b.title
      const label = b.hall ? `${b.hall} — ${customerLabel}` : customerLabel
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
    setPastBooking(false)
    setCurrentStep(0)
    setPaymentIncrement('')
    const initial = {
      ...EMPTY_FORM,
      start: toLocalInput(slotInfo.start),
      end: toLocalInput(slotInfo.end),
      hall: hallFilter === 'all' ? '' : hallFilter,
      // Defaults to today, editable afterward - saves re-typing the date on
      // every new booking when it's almost always today anyway.
      paymentDate: todayISO(),
      paymentDueDate: todayISO()
    }
    setForm(initial)
    setOriginalForm(initial)
  }

  const openEditForm = (event) => {
    if (!canEdit) return
    setFormMode('edit')
    setEditingId(event.id)
    setEditingIncomplete(event.resource.hasDetails === false)
    setPaymentLocked(Boolean(event.resource.fullyPaid))
    setPastBooking(isPastDate(event.start))
    setCurrentStep(0)
    setPaymentIncrement('')
    const b = event.resource
    const initial = {
      title: b.title,
      description: b.description,
      start: toLocalInput(event.start),
      end: toLocalInput(event.end),
      hall: b.hall || '',
      eventType: b.eventType || '',
      customerName: b.customerName || '',
      customerEmail: b.customerEmail || '',
      customerMobile: b.customerMobile || '',
      customerAddress: b.customerAddress || '',
      referredBy: b.referredBy || '',
      guestCount: b.guestCount || '',
      closedBy: b.closedBy || '',
      amountPaid: b.amountPaid || '',
      // Same "default to today, editable after" as a new booking - matters
      // for a booking created outside the app, which has no payment dates
      // on record at all until this edit becomes its first real save.
      paymentDate: b.paymentDate || todayISO(),
      committedAmount: b.committedAmount || '',
      paymentDueDate: b.paymentDueDate || todayISO()
    }
    setForm(initial)
    setOriginalForm(initial)
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingId(null)
    setEditingIncomplete(false)
    setPaymentLocked(false)
    setPastBooking(false)
    setCurrentStep(0)
    setPaymentIncrement('')
    setSaving(false)
    setForm(EMPTY_FORM)
    setOriginalForm(EMPTY_FORM)
  }

  const goToStep = (step) => setCurrentStep(step)

  const nextStep = () => {
    if (!stepIsValid(currentStep)) {
      setError('Please fill in the required fields on this step before continuing.')
      return
    }
    setError('')
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Belt-and-suspenders alongside the disabled Save button below - blocks
    // a submission that somehow still fires (e.g. Enter key) with nothing
    // changed, or a second one landing while the first is still in flight
    // (which is exactly how the same edit ended up in event_history several
    // times in a row a few seconds apart).
    if (!isDirty || saving || pastBooking) return
    setError('')
    // Steps other than the current one aren't in the DOM, so the browser's
    // native `required` validation only ever sees whichever step is showing.
    // This catches a missing field on a step the user never visited and
    // sends them there, instead of a confusing server-side rejection while
    // looking at an unrelated step.
    const invalidStep = STEPS.findIndex((_, i) => !stepIsValid(i))
    if (invalidStep !== -1) {
      setCurrentStep(invalidStep)
      setError('Please fill in the required fields highlighted on this step.')
      return
    }
    const payload = {
      title: form.title,
      description: form.description,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      hall: form.hall,
      eventType: form.eventType,
      customerName: form.customerName,
      customerEmail: form.customerEmail,
      customerMobile: form.customerMobile,
      customerAddress: form.customerAddress,
      referredBy: form.referredBy,
      guestCount: form.guestCount,
      closedBy: form.closedBy,
      amountPaid: effectiveAmountPaid,
      paymentDate: form.paymentDate,
      committedAmount: form.committedAmount,
      paymentDueDate: form.paymentDueDate
    }
    setSaving(true)
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
      setSaving(false)
    }
  }

  const cancelBooking = async () => {
    if (!editingId || !window.confirm('Cancel this booking?')) return
    const cancellationReason = window.prompt('Reason for cancellation (optional):') || ''
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/bookings/${editingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancellationReason })
      })
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

      {error && !formMode && <p className="team-error">{error}</p>}

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
            {error && <p className="team-error">{error}</p>}
            {editingIncomplete && (
              <p className="booking-incomplete-warning">
                ⚠ This booking was created outside the app (likely from a phone's calendar app) and is missing customer/payment details. Please fill them in below.
              </p>
            )}
            {pastBooking && (
              <p className="booking-incomplete-warning">
                🔒 This event's date has already passed - past bookings can't be edited.
              </p>
            )}

            <div className="booking-step-tabs">
              {STEPS.map((step, i) => (
                <button
                  key={step.id}
                  type="button"
                  className={`booking-step-tab${currentStep === i ? ' active' : ''}`}
                  onClick={() => goToStep(i)}
                >
                  {step.label}
                </button>
              ))}
            </div>

            <fieldset className="booking-fieldset" disabled={pastBooking}>
            {currentStep === 0 && (
              <div className="booking-modal-grid">
                <label className="booking-field booking-field-full">
                  Title *
                  <input
                    required
                    // A mobile-created Calendar event can have a blank title
                    // (unlike start/end, which Calendar always requires) -
                    // stay locked once a real title exists, but open up if
                    // it's actually empty so it can be filled in. Checks the
                    // snapshot from when the modal opened, not the live
                    // value - checking form.title here would re-lock the
                    // field the instant the first character was typed.
                    disabled={formMode === 'edit' && Boolean(originalForm.title)}
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
                <label className="booking-field booking-field-full">
                  Event type
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                  >
                    <option value="">— Select event type —</option>
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
              </div>
            )}

            {currentStep === 1 && (
              <div className="booking-modal-grid">
                <label className="booking-field">
                  Name *
                  <input
                    required
                    disabled={formMode === 'edit' && !editingIncomplete}
                    value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  />
                </label>
                <label className="booking-field">
                  Email
                  <input
                    type="email"
                    disabled={formMode === 'edit' && !editingIncomplete}
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                  />
                </label>
                <label className="booking-field booking-field-full">
                  Mobile *
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    title="Enter a valid 10-digit mobile number"
                    maxLength={10}
                    value={form.customerMobile}
                    onChange={(e) => setForm({ ...form, customerMobile: digitsOnly(e.target.value) })}
                  />
                </label>
                <label className="booking-field booking-field-full">
                  Address
                  <input
                    disabled={formMode === 'edit' && !editingIncomplete}
                    value={form.customerAddress}
                    onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                  />
                </label>
                <label className="booking-field">
                  Referred by
                  <input
                    value={form.referredBy}
                    onChange={(e) => setForm({ ...form, referredBy: e.target.value })}
                  />
                </label>
                <label className="booking-field">
                  Guest count
                  <input
                    type="number"
                    value={form.guestCount}
                    onChange={(e) => setForm({ ...form, guestCount: e.target.value })}
                  />
                </label>
                <label className="booking-field booking-field-full">
                  Closed by
                  <input
                    value={form.closedBy}
                    onChange={(e) => setForm({ ...form, closedBy: e.target.value })}
                  />
                </label>
              </div>
            )}

            {currentStep === 2 && (
              <div className="booking-modal-grid">
                {paymentLocked && <p className="booking-incomplete-warning booking-field-full">🔒 Payment details are locked because this booking is marked fully paid.</p>}
                {/* A booking created outside the app (from a phone's calendar)
                    has no committed amount or payment on record at all yet -
                    same "first entry" fields as a new booking, not the
                    increment field below, since there's no baseline to add to. */}
                {(formMode !== 'edit' || editingIncomplete) && (
                  <>
                    <label className="booking-field booking-field-full">
                      Total committed amount
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={paymentLocked}
                        value={form.committedAmount}
                        onChange={(e) => setForm({ ...form, committedAmount: numericOnly(e.target.value) })}
                      />
                    </label>
                    <label className="booking-field booking-field-full">
                      Amount paid *
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={form.amountPaid}
                        onChange={(e) => setForm({ ...form, amountPaid: numericOnly(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                {formMode === 'edit' && !editingIncomplete && (
                  <label className="booking-field booking-field-full">
                    Amount paid now
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={paymentLocked}
                      placeholder="0"
                      value={paymentIncrement}
                      onChange={(e) => setPaymentIncrement(numericOnly(e.target.value))}
                    />
                  </label>
                )}
                <div className="booking-field">
                  Balance
                  <p className="booking-computed-value">{computedBalance !== null ? computedBalance.toLocaleString() : '—'}</p>
                </div>
                <label className="booking-checkbox-field" title="Set automatically once amount paid reaches the committed amount - not editable directly">
                  <input type="checkbox" disabled checked={isFullyPaid} readOnly />
                  Fully paid
                </label>
                <label className="booking-field">
                  Payment date
                  <input
                    type="date"
                    disabled={paymentLocked}
                    value={form.paymentDate}
                    onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  />
                </label>
                <label className="booking-field">
                  Payment due date
                  <input
                    type="date"
                    disabled={paymentLocked}
                    value={form.paymentDueDate}
                    onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })}
                  />
                </label>
              </div>
            )}
            </fieldset>

            <div className="team-actions">
              {currentStep > 0 && (
                <button type="button" className="booking-step-nav-btn" onClick={() => goToStep(currentStep - 1)}>← Back</button>
              )}
              {currentStep < STEPS.length - 1 && (
                <button type="button" className="booking-step-nav-btn" onClick={nextStep}>Next →</button>
              )}
              {!pastBooking && (
                <button type="submit" className="booking-save-btn" disabled={!isDirty || saving} title={!isDirty ? 'No changes to save yet' : undefined}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
              {CANCELLATION_ENABLED && formMode === 'edit' && (
                <button type="button" className="booking-cancel-btn" onClick={cancelBooking}>Cancel Booking</button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
