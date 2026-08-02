import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { applyProductTranslation } from '../../lib/translate'

const router = Router()

// GET /api/store/search?q=keyword
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const q = (req.query.q as string)?.trim()
    if (!q || q.length < 2) return res.json({ success: true, data: [] })

    const products = await prisma.product.findMany({
      where: {
        storeId,
        status: 'ACTIVE',
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { shortDescription: { contains: q, mode: 'insensitive' } },
          { tags: { has: q.toLowerCase() } },
          ...(locale ? [{ translations: { some: { locale, title: { contains: q, mode: 'insensitive' as const } } } }] : []),
        ],
      },
      take: 20,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: { select: { price: true, compareAtPrice: true }, take: 1, orderBy: { isDefault: 'desc' } },
        ...(locale ? { translations: { where: { locale } } } : {}),
      },
    })

    res.json({ success: true, data: products.map((p) => applyProductTranslation(p, locale)) })
  } catch (err) { next(err) }
})

export default router
