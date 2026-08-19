import { readFileSync } from 'fs'
import { google } from 'googleapis'

const {
  GOOGLE_CALENDAR_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './credentials/google-service-account.json'
} = process.env

if (!GOOGLE_CALENDAR_ID) {
  throw new Error('GOOGLE_CALENDAR_ID must be set (see server/.env.example)')
}

const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8'))
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
})
const calendar = google.calendar({ version: 'v3', auth })

// Timed events have start.dateTime; all-day events (e.g. created on mobile
// without picking specific times) only have start.date - fall back to that
// so those don't silently disappear from the app.
function toBooking(event) {
  return {
    id: event.id,
    title: event.summary || '',
    description: event.description || '',
    start: event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00` : undefined),
    end: event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00` : undefined),
    // Which of the three halls this booking is for. Stored as a private
    // extended property rather than in the title, so it can also be used
    // to scope conflict checks per hall (see hasConflict below). Events
    // created outside the app (e.g. a phone's calendar app) won't have
    // this set - the UI treats that the same as an incomplete booking.
    hall: event.extendedProperties?.private?.hall || ''
  }
}

export async function listBookings() {
  const res = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: 250
  })
  return (res.data.items || []).map(toBooking)
}

// Scoped to a single hall - a time slot is only a conflict if that SAME
// hall already has a booking overlapping it, so the three halls can be
// booked independently for the same date/time.
async function hasConflict(start, end, hall, excludeId) {
  const res = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    singleEvents: true,
    timeMin: start,
    timeMax: end,
    privateExtendedProperty: [`hall=${hall}`]
  })
  return (res.data.items || []).some((event) => event.id !== excludeId)
}

function conflictError(hall) {
  const err = new Error(`${hall} is already booked for that time slot`)
  err.code = 'CONFLICT'
  return err
}

export async function createBooking({ title, description, start, end, hall }) {
  if (await hasConflict(start, end, hall)) throw conflictError(hall)
  const res = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: title,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      extendedProperties: { private: { hall } }
    }
  })
  return toBooking(res.data)
}

export async function updateBooking(id, { title, description, start, end, hall }) {
  if (await hasConflict(start, end, hall, id)) throw conflictError(hall)
  const res = await calendar.events.update({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId: id,
    requestBody: {
      summary: title,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      extendedProperties: { private: { hall } }
    }
  })
  return toBooking(res.data)
}

export async function deleteBooking(id) {
  await calendar.events.delete({ calendarId: GOOGLE_CALENDAR_ID, eventId: id })
}
