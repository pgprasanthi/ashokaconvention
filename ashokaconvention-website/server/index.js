import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter, requireAuth, requireAdmin } from './auth.js'

const { PORT = 8787, CLIENT_ORIGIN = 'http://localhost:5173' } = process.env

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))

app.use('/api/auth', authRouter)

// Example of an admin-only endpoint. Replace with real admin functionality
// (managing gallery photos, reading feedback submissions, etc).
app.get('/api/admin/ping', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true, message: `Hello admin ${req.user.email}` })
})

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`)
})
