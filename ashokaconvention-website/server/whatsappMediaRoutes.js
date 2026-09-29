import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { getMedia } from './whatsappMedia.js'

export const whatsappMediaRouter = Router()
// Same access level as the leads/conversation view itself (leadRoutes.js) -
// staff and admin both read conversation threads day-to-day.
whatsappMediaRouter.use(requireAuth, requireRole('admin', 'staff'))

// Serves one stored attachment's raw bytes with its real content type, so
// it can be used directly as an <img src> - never Meta's own (short-lived,
// token-gated) media URL. Cached privately since a stored attachment never
// changes once downloaded.
whatsappMediaRouter.get('/:id', async (req, res) => {
  try {
    const media = await getMedia(req.params.id)
    if (!media) return res.sendStatus(404)
    res.setHeader('Content-Type', media.mimeType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.send(media.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
