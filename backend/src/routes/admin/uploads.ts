import { Router, Response, NextFunction } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { uploadFile, deleteFile } from '../../services/storage'
import { prisma } from '../../config/database'
import { createError } from '../../middleware/errorHandler'

const router = Router()
router.use(requireAdmin)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(createError('Only image files allowed', 400, 'INVALID_FILE') as any)
  },
})

// POST /api/admin/uploads/image
router.post('/image', upload.single('file'), async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw createError('No file provided', 400, 'NO_FILE')
    const folder = (req.query.folder as string) || 'general'

    const processed = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const url = await uploadFile(processed, `${Date.now()}.webp`, 'image/webp', folder)

    await prisma.asset.create({
      data: { filename: req.file.originalname, url, mimeType: 'image/webp', size: processed.length, folder },
    })

    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

// POST /api/admin/uploads/images (multiple)
router.post('/images', upload.array('files', 10), async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files?.length) throw createError('No files provided', 400, 'NO_FILE')
    const folder = (req.query.folder as string) || 'products'

    const urls = await Promise.all(files.map(async (file) => {
      const processed = await sharp(file.buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      const url = await uploadFile(processed, `${Date.now()}.webp`, 'image/webp', folder)
      await prisma.asset.create({
        data: { filename: file.originalname, url, mimeType: 'image/webp', size: processed.length, folder },
      })
      return url
    }))

    res.json({ success: true, data: { urls } })
  } catch (err) { next(err) }
})

const printFileUpload = multer({
  storage: multer.memoryStorage(),
  // Print artwork needs to stay full quality/resolution — much larger than a webp thumbnail.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf', 'image/svg+xml']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(createError('Print files must be PNG, JPEG, PDF, or SVG', 400, 'INVALID_FILE') as any)
  },
})

// POST /api/admin/uploads/print-file
// Deliberately skips the sharp resize/webp re-encode the image endpoints above do — print
// suppliers (Gelato) need the artwork at its original resolution and format, not a display
// thumbnail. See Product.printFiles / GelatoAdapter.placeOrder.
router.post('/print-file', printFileUpload.single('file'), async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw createError('No file provided', 400, 'NO_FILE')
    const folder = (req.query.folder as string) || 'print-files'

    const url = await uploadFile(req.file.buffer, `${Date.now()}-${req.file.originalname}`, req.file.mimetype, folder)

    await prisma.asset.create({
      data: { filename: req.file.originalname, url, mimeType: req.file.mimetype, size: req.file.size, folder },
    })

    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

// DELETE /api/admin/uploads
router.delete('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { url } = z_url.parse(req.body)
    await deleteFile(url)
    await prisma.asset.deleteMany({ where: { url } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

import { z } from 'zod'
const z_url = z.object({ url: z.string().url() })

export default router
