import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { createError } from '../../middleware/errorHandler'
import { applyProductTranslation, applyCategoryTranslation, translationsSelect } from '../../lib/translate'
import { resolveComplianceProfile, getRequiredFields } from '../../lib/complianceProfiles'

function mergeProduct(p: any, locale?: string) {
  const merged = applyProductTranslation(p, locale) as any
  if (merged.category) merged.category = applyCategoryTranslation(merged.category, locale)
  return merged
}

const router = Router()

// GET /api/store/products
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const categorySlug = req.query.category as string | undefined
    const featured = req.query.featured === 'true'
    const sort = (req.query.sort as string) || 'createdAt_desc'
    const search = (req.query.search as string)?.trim()
    const minPrice = parseFloat(req.query.minPrice as string) || undefined
    const maxPrice = parseFloat(req.query.maxPrice as string) || undefined
    const tag = req.query.tag as string | undefined

    const where: any = { storeId, status: 'ACTIVE' }

    if (categorySlug) {
      const cat = await prisma.category.findFirst({
        where: { slug: categorySlug, storeId },
        include: { children: { select: { id: true } } },
      })
      if (cat) {
        where.categoryId = cat.children.length > 0
          ? { in: [cat.id, ...cat.children.map((c) => c.id)] }
          : cat.id
      }
    }
    if (featured) where.isFeatured = true

    if (search && search.length >= 2) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
        ...(locale ? [{ translations: { some: { locale, title: { contains: search, mode: 'insensitive' as const } } } }] : []),
      ]
    }

    if (tag) {
      where.tags = { has: tag.toLowerCase() }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.variants = {
        some: {
          ...(minPrice !== undefined ? { price: { gte: minPrice } } : {}),
          ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
        },
      }
    }

    const [field, dir] = sort.split('_')
    const orderBy: any =
      field === 'price'
        ? { variants: { _min: { price: dir === 'asc' ? 'asc' : 'desc' } } }
        : { [field === 'title' ? 'title' : 'createdAt']: dir === 'asc' ? 'asc' : 'desc' }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true, title: true, slug: true, status: true, isFeatured: true, tags: true,
          shortDescription: true, categoryId: true, createdAt: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          variants: { select: { id: true, title: true, price: true, compareAtPrice: true, inventoryQty: true, isDefault: true, options: true, imageUrl: true } },
          category: { select: { name: true, slug: true, ...translationsSelect(locale) } },
          ...translationsSelect(locale),
        },
      }),
    ])

    res.json({ success: true, data: products.map((p) => mergeProduct(p, locale)), meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/store/products/collection/best-sellers
router.get('/collection/best-sellers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20)

    const topItems = await prisma.orderItem.groupBy({
      by: ['variantId'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit * 2,
    })

    if (topItems.length === 0) {
      res.json({ success: true, data: [] })
      return
    }

    const variantIds = topItems.map((i) => i.variantId)
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    })

    const productIds = [...new Set(variants.map((v) => v.productId))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId, status: 'ACTIVE' },
      take: limit,
      select: {
        id: true, title: true, slug: true, status: true, isFeatured: true, tags: true,
        shortDescription: true, categoryId: true, createdAt: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        variants: { select: { id: true, title: true, price: true, compareAtPrice: true, inventoryQty: true, isDefault: true, options: true, imageUrl: true } },
        category: { select: { name: true, slug: true, ...translationsSelect(locale) } },
        ...translationsSelect(locale),
      },
    })

    const orderMap = new Map<string, number>()
    for (const item of topItems) {
      const v = variants.find((vr) => vr.id === item.variantId)
      if (v) {
        orderMap.set(v.productId, (orderMap.get(v.productId) ?? 0) + (item._sum.quantity ?? 0))
      }
    }
    products.sort((a, b) => (orderMap.get(b.id) ?? 0) - (orderMap.get(a.id) ?? 0))

    res.json({ success: true, data: products.slice(0, limit).map((p) => mergeProduct(p, locale)) })
  } catch (err) { next(err) }
})

// GET /api/store/products/:slug
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, storeId },
      select: {
        id: true, title: true, slug: true, description: true, shortDescription: true,
        status: true, videoUrl: true, isFeatured: true, tags: true,
        listVariantsIndividually: true, deliveryMinDays: true, deliveryMaxDays: true,
        categoryId: true, createdAt: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          select: {
            id: true, title: true, price: true, compareAtPrice: true,
            inventoryQty: true, trackInventory: true, allowBackorder: true,
            isDefault: true, options: true, imageUrl: true, sku: true,
          },
        },
        options: { include: { values: true }, orderBy: { sortOrder: 'asc' } },
        category: { select: { name: true, slug: true, complianceProfile: true, ...translationsSelect(locale) } },
        complianceProfile: true,
        complianceData: true,
        ...translationsSelect(locale),
      },
    })

    if (!product || product.status !== 'ACTIVE') throw createError('Product not found', 404, 'NOT_FOUND')

    // Resolve the profile server-side and hand the storefront a flat, ready-to-render list, so
    // the compliance registry stays in one place instead of being duplicated in the frontend.
    const profile = resolveComplianceProfile(product.complianceProfile, product.category?.complianceProfile)
    const data = (product.complianceData ?? {}) as Record<string, unknown>
    const compliance =
      profile === 'NONE'
        ? null
        : {
            profile,
            fields: getRequiredFields(profile)
              .map((f) => ({ key: f.key, label: f.label, value: data[f.key] }))
              .filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== ''),
          }

    res.json({ success: true, data: { ...mergeProduct(product, locale), compliance } })
  } catch (err) { next(err) }
})

// GET /api/store/products/:slug/related
router.get('/:slug/related', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 12)

    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, storeId, status: 'ACTIVE' },
      select: { id: true, categoryId: true, tags: true },
    })
    if (!product) throw createError('Product not found', 404, 'NOT_FOUND')

    const baseWhere: any = { storeId, status: 'ACTIVE' as const, id: { not: product.id } }
    const selectFields = {
      id: true, title: true, slug: true, createdAt: true,
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
      variants: { select: { id: true, title: true, price: true, compareAtPrice: true, isDefault: true, options: true, imageUrl: true } },
      ...translationsSelect(locale),
    }

    let related = await prisma.product.findMany({
      where: { ...baseWhere, categoryId: product.categoryId ?? undefined },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: selectFields,
    })

    if (related.length < limit) {
      const excludeIds = [product.id, ...related.map((r) => r.id)]
      const more = await prisma.product.findMany({
        where: { ...baseWhere, id: { notIn: excludeIds } },
        take: limit - related.length,
        orderBy: { createdAt: 'desc' },
        select: selectFields,
      })
      related = [...related, ...more]
    }

    res.json({ success: true, data: related.map((p) => mergeProduct(p, locale)) })
  } catch (err) { next(err) }
})

export default router
