import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter } from './auth.js'
import { teamRouter } from './teamRoutes.js'
import { bookingRouter } from './bookingRoutes.js'
import { guestRouter } from './guestRoutes.js'
import { whatsappRouter } from './whatsappRoutes.js'
import { reportRouter } from './reportRoutes.js'
import { leadRouter } from './leadRoutes.js'
import { settingsRouter } from './settingsRoutes.js'

const { PORT = 8787, CLIENT_ORIGIN = 'http://localhost:5173', WHATSAPP_WEBHOOK_SECRET_PATH } = process.env

if (!WHATSAPP_WEBHOOK_SECRET_PATH) {
  throw new Error('WHATSAPP_WEBHOOK_SECRET_PATH must be set (see server/.env.example)')
}

const app = express()
// Render (and most PaaS hosts) terminate HTTPS in front of the app and
// forward plain HTTP internally - without this, Express can't tell the
// original request was secure, which breaks secure-cookie behavior.
app.set('trust proxy', 1)
app.use(express.json())
app.use(cookieParser())
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))

app.use('/api/auth', authRouter)
app.use('/api/team', teamRouter)
app.use('/api/bookings', bookingRouter)
app.use('/api/guests', guestRouter)
// Dualhook's Embedded Signup flow delivers real messages straight from Meta,
// signed with Dualhook's own Meta App secret (not ours) - so HMAC signature
// verification can never pass here (see whatsappRoutes.js). This path itself
// is the substitute protection: a long random segment nobody can guess,
// combined with payload validation (WABA/phone number ID) inside the router.
app.use(`/api/whatsapp/webhook/${WHATSAPP_WEBHOOK_SECRET_PATH}`, whatsappRouter)
app.use('/api/reports', reportRouter)
app.use('/api/leads', leadRouter)
app.use('/api/settings', settingsRouter)

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`)
})
