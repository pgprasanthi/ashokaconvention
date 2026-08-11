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

function toBooking(event) {
  return {
    id: event.id,
    title: event.summary || '',
    description: event.description || '',
    start: event.start?.dateTime,
    end: event.end?.dateTime
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

async function hasConflict(start, end, excludeId) {
  const res = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    singleEvents: true,
    timeMin: start,
    timeMax: end
  })
  return (res.data.items || []).some((event) => event.id !== excludeId)
}

function conflictError() {
  const err = new Error('That time slot is already booked')
  err.code = 'CONFLICT'
  return err
}

export async function createBooking({ title, description, start, end }) {
  if (await hasConflict(start, end)) throw conflictError()
  const res = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: { summary: title, description, start: { dateTime: start }, end: { dateTime: end } }
  })
  return toBooking(res.data)
}

export async function updateBooking(id, { title, description, start, end }) {
  if (await hasConflict(start, end, id)) throw conflictError()
  const res = await calendar.events.update({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId: id,
    requestBody: { summary: title, description, start: { dateTime: start }, end: { dateTime: end } }
  })
  return toBooking(res.data)
}

export async function deleteBooking(id) {
  await calendar.events.delete({ calendarId: GOOGLE_CALENDAR_ID, eventId: id })
}
