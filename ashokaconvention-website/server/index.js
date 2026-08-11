import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter } from './auth.js'
import { teamRouter } from './teamRoutes.js'
import { bookingRouter } from './bookingRoutes.js'
import { guestRouter } from './guestRoutes.js'

const { PORT = 8787, CLIENT_ORIGIN = 'http://localhost:5173' } = process.env

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

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`)
})
