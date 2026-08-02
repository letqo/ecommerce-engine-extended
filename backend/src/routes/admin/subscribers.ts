import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'

const router = Router()
router.use(requireAdmin)

router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined

    const where: any = { storeId: req.storeId }
    if (search) where.email = { contains: search, mode: 'insensitive' }
    if (status === 'active') where.isActive = true
    if (status === 'inactive') where.isActive = false

    const [total, subscribers] = await Promise.all([
      prisma.emailSubscriber.count({ where }),
      prisma.emailSubscriber.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    res.json({ success: true, data: subscribers, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.emailSubscriber.deleteMany({ where: { id: req.params.id, storeId: req.storeId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
