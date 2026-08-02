import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { createError } from '../../middleware/errorHandler'
import { CustomerRequest } from '../../middleware/auth'

const router = Router()

// GET /api/store/reviews/token/:token — validate a review token and return product info
router.get('/token/:token', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params

    const orderItem = await prisma.orderItem.findUnique({
      where: { reviewToken: token },
      include: {
        order: {
          select: { customerId: true, status: true, storeId: true },
        },
        variant: {
          select: {
            product: {
              select: { id: true, title: true, slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } } },
            },
          },
        },
      },
    })

    if (!orderItem) throw createError('Invalid review link', 404, 'NOT_FOUND')
    if (orderItem.reviewTokenUsed) throw createError('This review link has already been used', 400, 'TOKEN_USED')

    const product = orderItem.variant.product

    res.json({
      success: true,
      data: {
        productId: product.id,
        productTitle: product.title,
        productSlug: product.slug,
        productImage: product.images[0]?.url ?? null,
        itemTitle: orderItem.title,
      },
    })
  } catch (err) { next(err) }
})

// POST /api/store/reviews — requires a valid review token
router.post('/', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { token, rating, title, body } = req.body

    if (!token) throw createError('Review token is required', 400, 'VALIDATION_ERROR')
    if (!rating || rating < 1 || rating > 5) throw createError('Rating must be between 1 and 5', 400, 'VALIDATION_ERROR')

    const orderItem = await prisma.orderItem.findUnique({
      where: { reviewToken: token },
      include: {
        order: {
          select: { customerId: true, storeId: true, status: true },
          include: { customer: { select: { id: true, firstName: true, lastName: true } } },
        },
        variant: { select: { productId: true } },
      },
    })

    if (!orderItem) throw createError('Invalid review token', 400, 'INVALID_TOKEN')
    if (orderItem.reviewTokenUsed) throw createError('This review link has already been used', 400, 'TOKEN_USED')
    if (orderItem.order.storeId !== storeId) throw createError('Invalid review token', 400, 'INVALID_TOKEN')

    const productId = orderItem.variant.productId
    const customerId = orderItem.order.customer?.id ?? null

    if (customerId) {
      const existing = await prisma.review.findUnique({
        where: { productId_customerId: { productId, customerId } },
      })
      if (existing) throw createError('You have already reviewed this product', 409, 'DUPLICATE')
    }

    const customer = orderItem.order.customer
    const authorName = customer?.firstName
      ? `${customer.firstName}${customer.lastName ? ' ' + customer.lastName.charAt(0) + '.' : ''}`
      : 'Verified Buyer'

    const [review] = await prisma.$transaction([
      prisma.review.create({
        data: {
          storeId,
          productId,
          customerId,
          authorName,
          rating: Math.round(rating),
          title: title?.trim() || null,
          body: body?.trim() || null,
        },
      }),
      prisma.orderItem.update({
        where: { id: orderItem.id },
        data: { reviewTokenUsed: true },
      }),
    ])

    res.status(201).json({ success: true, data: review })
  } catch (err) { next(err) }
})

// GET /api/store/reviews/:productId — public, returns approved reviews + aggregate
router.get('/:productId', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { productId } = req.params
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

    const where = { productId, storeId, status: 'APPROVED' as const }

    const [reviews, total, aggregate] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          authorName: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
        },
      }),
      prisma.review.count({ where }),
      prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ])

    const distribution = await prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { rating: true },
    })

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    distribution.forEach((d) => { ratingDistribution[d.rating] = d._count.rating })

    res.json({
      success: true,
      data: reviews,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        averageRating: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 10) / 10 : 0,
        totalReviews: aggregate._count.rating,
        distribution: ratingDistribution,
      },
    })
  } catch (err) { next(err) }
})

export default router
