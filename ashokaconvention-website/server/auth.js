import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { getRole } from './team.js'
import { recordGuestSignIn } from './guests.js'

const { GOOGLE_CLIENT_ID, SESSION_SECRET } = process.env

if (!GOOGLE_CLIENT_ID || !SESSION_SECRET) {
  throw new Error('GOOGLE_CLIENT_ID and SESSION_SECRET must be set (see server/.env.example)')
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)
const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const isProduction = process.env.NODE_ENV === 'production'

function issueSessionCookie(res, payload) {
  const token = jwt.sign(payload, SESSION_SECRET, { expiresIn: '7d' })
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    // Frontend and backend live on different Render subdomains in production,
    // so the cookie needs sameSite: 'none' to be sent cross-site at all.
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE_MS
  })
}

// Attaches req.user from the session cookie, or rejects the request.
export function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  try {
    req.user = jwt.verify(token, SESSION_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Session expired' })
  }
}

// requireRole('admin') / requireRole('admin', 'staff') etc.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' })
    }
    next()
  }
}

export const authRouter = Router()

// Exchange a Google ID token (from the frontend's Sign in with Google button)
// for our own session cookie, after verifying it came from Google and deciding
// the user's role from the admin allowlist.
authRouter.post('/google', async (req, res) => {
  const { credential } = req.body

  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' })
  }

  let ticket
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })
  } catch {
    return res.status(401).json({ error: 'Invalid Google credential' })
  }

  const payload = ticket.getPayload()
  if (!payload?.email_verified) {
    return res.status(401).json({ error: 'Email not verified with Google' })
  }

  const email = payload.email.toLowerCase()
  const role = await getRole(email)
  const user = { email, name: payload.name, picture: payload.picture, role }

  if (role === 'guest') {
    try {
      await recordGuestSignIn({ email, name: payload.name })
    } catch (err) {
      console.error('Failed to record guest sign-in:', err.message)
    }
  }

  issueSessionCookie(res, user)
  res.json(user)
})

authRouter.get('/me', (req, res) => {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return res.status(401).json({ error: 'Not signed in' })

  try {
    const user = jwt.verify(token, SESSION_SECRET)
    res.json(user)
  } catch {
    res.status(401).json({ error: 'Session expired' })
  }
})

authRouter.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE)
  res.status(204).end()
})
