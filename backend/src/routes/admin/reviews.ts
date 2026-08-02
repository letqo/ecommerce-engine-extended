import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'

const router = Router()

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function moderateReview(storeId: string | undefined, reviewId: string, status: 'APPROVED' | 'REJECTED') {
  const review = await prisma.review.findFirst({ where: { id: reviewId, storeId } })
  if (!review) throw createError('Review not found', 404, 'NOT_FOUND')
  return prisma.review.update({ where: { id: reviewId }, data: { status } })
}

router.use(requireAdmin)

// GET /api/admin/reviews
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const status = req.query.status as string | undefined

    const where: any = { storeId }
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      where.status = status
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { title: true, slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } } } },
          customer: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.review.count({ where }),
    ])

    res.json({ success: true, data: reviews, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// PATCH /api/admin/reviews/:id/status
router.patch('/:id/status', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { status } = req.body

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      throw createError('Status must be APPROVED or REJECTED', 400, 'VALIDATION_ERROR')
    }

    const updated = await moderateReview(storeId, req.params.id, status)

    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

// DELETE /api/admin/reviews/:id
router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId

    const review = await prisma.review.findFirst({ where: { id: req.params.id, storeId } })
    if (!review) throw createError('Review not found', 404, 'NOT_FOUND')

    await prisma.review.delete({ where: { id: req.params.id } })
    res.json({ success: true, message: 'Review deleted' })
  } catch (err) { next(err) }
})

export default router
