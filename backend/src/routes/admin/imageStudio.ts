import { Router, Response, NextFunction } from 'express'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { removeBackgroundAndUpload, polishAndUpload, generateSceneAndUpload } from '../../services/imageStudio'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

// POST /api/admin/image-studio/remove-bg
router.post('/remove-bg', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { imageUrl } = z.object({ imageUrl: z.string().url() }).parse(req.body)
    const url = await removeBackgroundAndUpload(imageUrl)
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

// POST /api/admin/image-studio/polish
router.post('/polish', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { imageUrl } = z.object({ imageUrl: z.string().url() }).parse(req.body)
    const url = await polishAndUpload(imageUrl)
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

// POST /api/admin/image-studio/generate-scene
router.post('/generate-scene', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { imageUrl, prompt, count, mode } = z.object({
      imageUrl: z.string().url(),
      prompt: z.string().min(3).max(1000),
      count: z.number().int().min(1).max(6).default(3),
      mode: z.enum(['create', 'extract', 'collage']).default('create'),
    }).parse(req.body)
    const urls = await generateSceneAndUpload(imageUrl, prompt, count, mode)
    res.json({ success: true, data: { urls } })
  } catch (err) { next(err) }
})

export default router
