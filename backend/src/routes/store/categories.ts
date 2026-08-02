import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { applyCategoryTranslation } from '../../lib/translate'

const router = Router()

// GET /api/store/categories
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const categories = await prisma.category.findMany({
      where: { storeId, isVisible: true, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { isVisible: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          ...(locale ? { include: { translations: { where: { locale } } } } : {}),
        },
        ...(locale ? { translations: { where: { locale } } } : {}),
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
    })

    const merged = categories.map((c) => {
      const mergedCat = applyCategoryTranslation(c, locale) as any
      mergedCat.children = c.children.map((child: any) => applyCategoryTranslation(child, locale))
      return mergedCat
    })

    res.json({ success: true, data: merged })
  } catch (err) { next(err) }
})

export default router
