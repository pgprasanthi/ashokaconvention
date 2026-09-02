// Shared display formatters for the payments/reminders screens. The server
// (paymentReminders.js) renders the message text itself with its own copies -
// these are only for what the browser shows in tables and modals.

// A "YYYY-MM-DD" date string -> "1 Sept 2026". Falls back to the raw input
// for anything unparseable, and an em dash for blank.
export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// A numeric amount -> "₹25,000" (Indian digit grouping). Non-numbers pass
// through as-is.
export function fmtAmount(v) {
  const n = Number(v)
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(v ?? '')
}

// The last-reminder cell shown in both the Payments table and the Admin
// summary - kept here so the two stay identical.
export function reminderStatusLabel(sendStatus) {
  if (sendStatus === 'failed') return '⚠ Failed'
  if (sendStatus === 'skipped') return 'Logged (not sent)'
  return '✓ Sent'
}
