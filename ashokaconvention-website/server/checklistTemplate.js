// The pre-event and post-event readiness checks, hardcoded the same way
// HALLS/EVENT_TYPES are - editing the list is a code change, not a DB or
// admin-screen operation. Only the staff/admin RESPONSES are persisted (see
// eventChecks.js); this file is the source of truth for what the items are,
// their order, and their labels.
//
// `key` is the stable identifier stored in event_checks.item_key - never
// rename an existing key or old responses orphan; add/remove instead. The
// frontend renders whatever labels the API returns (ChecklistPanel.jsx has
// no copy of this list), and the server validates every incoming key here.

export const PRE_CHECKS = [
  { key: 'pre_full_payment', label: 'Full payment / final balance collected' },
  { key: 'pre_deposit', label: 'Security / damage deposit collected' },
  { key: 'pre_agreement', label: 'Signed booking agreement on file' },
  { key: 'pre_guest_count', label: 'Final guest count confirmed' },
  { key: 'pre_timeline', label: 'Event timeline confirmed (start, function, dinner, vacate time)' },
  { key: 'pre_hall_clean', label: 'Hall cleaned and ready for handover' },
  { key: 'pre_restrooms', label: 'Restrooms cleaned and stocked' },
  { key: 'pre_furniture', label: 'Chairs / tables / sofas counted, in good condition' },
  { key: 'pre_electrical', label: 'AC, power, generator (fuel) checked' },
  { key: 'pre_sound_lights', label: 'Sound system, mics, stage & hall lighting tested' },
  { key: 'pre_water', label: 'Drinking water arrangement' },
  { key: 'pre_catering', label: 'Catering vendor confirmed (menu, count, timing)' },
  { key: 'pre_decor', label: 'Decoration vendor confirmed (design, load-in time)' },
  { key: 'pre_rooms', label: 'Bridal / green room ready' },
  { key: 'pre_parking_security', label: 'Parking plan + security staff assigned' },
  { key: 'pre_safety', label: 'Fire extinguishers in place, exits clear' },
  { key: 'pre_manager', label: 'On-duty event manager assigned' }
]

export const POST_CHECKS = [
  { key: 'post_full_payment', label: 'Full payment received (incl. overtime / extra guests / extras)' },
  { key: 'post_invoice', label: 'Final invoice generated and shared' },
  { key: 'post_damage_inspection', label: 'Damage inspection done (walls, furniture, fixtures, restrooms)' },
  { key: 'post_property_returned', label: 'All hall property returned by customer (chairs, linen, AV, keys, decor items)' },
  { key: 'post_deposit_settled', label: 'Security deposit refunded or adjusted against damages' },
  { key: 'post_inventory', label: 'Inventory reconciled against pre-event count' },
  { key: 'post_vendors_cleared', label: 'Decoration removed, catering area cleared by vendors' },
  { key: 'post_cleaning', label: 'Hall deep-cleaned, garbage cleared' },
  { key: 'post_meter_readings', label: 'Generator / electricity meter readings recorded' },
  { key: 'post_lost_found', label: 'Lost & found items collected and logged' },
  { key: 'post_incident', label: 'Incident / complaint report filed (if any)' },
  { key: 'post_feedback', label: 'Customer feedback and rating collected' },
  { key: 'post_review', label: 'Google review / testimonial requested' },
  { key: 'post_photos', label: 'Photos + usage consent collected for gallery/marketing' }
]

export const CHECK_STATUSES = ['pending', 'done', 'na']

// phase ('pre'|'post') attached here so callers/queries don't have to infer
// it from the key prefix.
const withPhase = (items, phase) => items.map((item) => ({ ...item, phase }))
export const ALL_CHECKS = [...withPhase(PRE_CHECKS, 'pre'), ...withPhase(POST_CHECKS, 'post')]

const CHECK_BY_KEY = new Map(ALL_CHECKS.map((c) => [c.key, c]))
export function isValidCheckKey(key) {
  return CHECK_BY_KEY.has(key)
}
export function checkPhase(key) {
  return CHECK_BY_KEY.get(key)?.phase || ''
}
