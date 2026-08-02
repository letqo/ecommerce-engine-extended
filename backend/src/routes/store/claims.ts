import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { createError } from '../../middleware/errorHandler'
import { uploadFile } from '../../services/storage'
import { sendClaimReceivedEmail, sendClaimAdminAlertEmail } from '../../services/email'

const router = Router()

// A report can't be filed until this many days after it's expected to have arrived —
// the claim window itself (how long AFTER that a customer can still report damage).
const CLAIM_WINDOW_DAYS = 14
// Fallback expected-delivery estimate when no order item's product has one recorded.
const DEFAULT_DELIVERY_DAYS = 21

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(createError('Only image files allowed', 400, 'INVALID_FILE') as any)
  },
})

// POST /api/store/claims/photos — evidence photo upload, public but capped and image-only
router.post('/photos', upload.array('files', 6), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files?.length) throw createError('No files provided', 400, 'NO_FILE')

    const urls = await Promise.all(files.map(async (file) => {
      const processed = await sharp(file.buffer)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      return uploadFile(processed, `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`, 'image/webp', 'claims')
    }))

    res.json({ success: true, data: { urls } })
  } catch (err) { next(err) }
})

const submitSchema = z.object({
  orderNumber: z.coerce.number().int(),
  email: z.string().email(),
  reason: z.enum(['damaged', 'missing_parts', 'wrong_item', 'never_arrived']),
  description: z.string().min(1).max(2000),
  photos: z.array(z.string().url()).min(1).max(6),
})

// POST /api/store/claims — submit a damage/problem report on a delivered order
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = submitSchema.parse(req.body)

    const order = await prisma.order.findFirst({
      where: {
        orderNumber: input.orderNumber,
        OR: [{ guestEmail: input.email }, { customer: { email: input.email } }],
      },
      include: {
        items: { include: { variant: { include: { product: { select: { title: true, deliveryMaxDays: true } } } } } },
      },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    if (!order.shippedAt) throw createError('This order has not shipped yet — nothing to report a problem with.', 400, 'NOT_SHIPPED')

    const maxDeliveryDays = Math.max(DEFAULT_DELIVERY_DAYS, ...order.items.map((i) => i.variant.product?.deliveryMaxDays ?? 0))
    const deadline = new Date(order.shippedAt.getTime() + (maxDeliveryDays + CLAIM_WINDOW_DAYS) * 24 * 60 * 60 * 1000)
    if (new Date() > deadline) {
      throw createError(`The reporting window for this order closed on ${deadline.toLocaleDateString()}. Contact us directly if you believe this is an exception.`, 400, 'WINDOW_CLOSED')
    }

    const existingOpen = await prisma.damageClaim.findFirst({
      where: { orderId: order.id, status: { in: ['PENDING', 'NEEDS_REVIEW'] } },
    })
    if (existingOpen) throw createError('You already have an open report on this order — we\'ll follow up on that one.', 400, 'ALREADY_OPEN')

    const claim = await prisma.damageClaim.create({
      data: {
        orderId: order.id,
        reason: input.reason,
        description: input.description,
        photos: input.photos,
        status: 'NEEDS_REVIEW',
      },
    })

    sendClaimReceivedEmail(order.id).catch((e: Error) => console.error('Claim received email error:', e.message))
    sendClaimAdminAlertEmail(order.id, claim.id).catch((e: Error) => console.error('Claim admin alert email error:', e.message))

    res.json({ success: true, data: { claimId: claim.id } })
  } catch (err) { next(err) }
})

export default router
