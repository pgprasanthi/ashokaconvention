// Payment types a booking can have a line item for - each with its own
// committed amount and balance (see payments.js). Same "hardcoded list,
// validated in routes" pattern as HALLS (halls.js). Extend this list (and
// the matching PAYMENT_TYPES array in src/components/BookingsCalendar.jsx)
// whenever a new kind of charge needs tracking.
export const PAYMENT_TYPES = ['hall_rent', 'catering', 'decor', 'advance', 'other']

const PAYMENT_TYPE_LABELS = {
  hall_rent: 'Hall Rent',
  catering: 'Catering',
  decor: 'Decor',
  advance: 'Advance',
  other: 'Other'
}

export function paymentTypeLabel(type) {
  return PAYMENT_TYPE_LABELS[type] || type
}
