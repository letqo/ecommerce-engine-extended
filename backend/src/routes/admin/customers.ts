import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/customers
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = req.query.search as string | undefined

    const where: any = { storeId: req.storeId }
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          acceptsMarketing: true, isVerified: true, createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
    ])

    res.json({ success: true, data: customers, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/admin/customers/:id
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        acceptsMarketing: true, isVerified: true, createdAt: true,
        addresses: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
        },
      },
    })
    if (!customer) throw createError('Customer not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: customer })
  } catch (err) { next(err) }
})

export default router
