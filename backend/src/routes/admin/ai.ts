import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { enhanceProduct, generateStoreContent, generateBlogDraft, StoreContentField, translateProductContent, translateCategoryContent, translateStoreContent, translateThemeStrings } from '../../services/aiEnhance'
import { extractThemeStrings } from '../../lib/themeText'
import { env } from '../../config/env'
import { isLocale } from '../../lib/locales'

const router = Router()
router.use(requireAdmin)

router.post('/enhance', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({
        success: false,
        error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your backend/.env file.' },
      })
    }

    const { productId } = req.body
    if (!productId) return res.status(400).json({ success: false, error: { message: 'productId is required' } })

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true, title: true, options: true } } },
    })

    if (!product) return res.status(404).json({ success: false, error: { message: 'Product not found' } })

    const result = await enhanceProduct({
      title: product.title,
      description: product.description,
      shortDescription: product.shortDescription,
      vendor: product.vendor,
      variants: product.variants.map((v) => ({
        id: v.id,
        title: v.title,
        options: (v.options as Record<string, string>) ?? {},
      })),
    })

    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

const VALID_STORE_FIELDS: StoreContentField[] = ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent']

router.post('/store-content', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set in your backend/.env file.' } })
    }

    const { field } = req.body
    if (!field || !VALID_STORE_FIELDS.includes(field)) {
      return res.status(400).json({ success: false, error: { message: `field must be one of: ${VALID_STORE_FIELDS.join(', ')}` } })
    }

    const store = req.storeId
      ? await prisma.store.findUnique({ where: { id: req.storeId } })
      : await prisma.store.findFirst()

    const result = await generateStoreContent(field as StoreContentField, {
      name: store?.name ?? 'Store',
      description: store?.description ?? undefined,
      contactEmail: store?.contactEmail ?? undefined,
      currency: store?.currency ?? 'USD',
    })

    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.post('/blog-draft', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set in your backend/.env file.' } })
    }

    const { topic } = req.body
    if (!topic?.trim()) {
      return res.status(400).json({ success: false, error: { message: 'topic is required' } })
    }

    const store = req.storeId
      ? await prisma.store.findUnique({ where: { id: req.storeId } })
      : await prisma.store.findFirst()

    const result = await generateBlogDraft(topic, {
      name: store?.name ?? 'Store',
      description: store?.description ?? undefined,
    })

    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.post('/translate-product', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your backend/.env file.' } })
    }

    const { productId, targetLocale } = req.body
    if (!productId) return res.status(400).json({ success: false, error: { message: 'productId is required' } })
    if (!isLocale(targetLocale)) return res.status(400).json({ success: false, error: { message: 'targetLocale must be one of en, fr, de, it, es' } })

    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return res.status(404).json({ success: false, error: { message: 'Product not found' } })

    const result = await translateProductContent({
      title: product.title,
      shortDescription: product.shortDescription,
      description: product.description,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
    }, targetLocale)

    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.post('/translate-category', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your backend/.env file.' } })
    }

    const { categoryId, targetLocale } = req.body
    if (!categoryId) return res.status(400).json({ success: false, error: { message: 'categoryId is required' } })
    if (!isLocale(targetLocale)) return res.status(400).json({ success: false, error: { message: 'targetLocale must be one of en, fr, de, it, es' } })

    const category = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) return res.status(404).json({ success: false, error: { message: 'Category not found' } })

    const result = await translateCategoryContent({
      name: category.name,
      description: category.description,
    }, targetLocale)

    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

const STORE_TRANSLATABLE_FIELDS = ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent'] as const

router.post('/translate-store-content', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your backend/.env file.' } })
    }

    const { targetLocale } = req.body
    if (!isLocale(targetLocale)) return res.status(400).json({ success: false, error: { message: 'targetLocale must be one of en, fr, de, it, es' } })

    const store = req.storeId
      ? await prisma.store.findUnique({ where: { id: req.storeId } })
      : await prisma.store.findFirst()
    if (!store) return res.status(404).json({ success: false, error: { message: 'Store not found' } })

    const fields: Record<string, string> = {}
    for (const key of STORE_TRANSLATABLE_FIELDS) {
      const value = (store as any)[key]
      if (value) fields[key] = value
    }

    const result = await translateStoreContent(fields, targetLocale)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.post('/translate-theme', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ success: false, error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your backend/.env file.' } })
    }

    const { slug, targetLocale } = req.body
    if (!slug) return res.status(400).json({ success: false, error: { message: 'slug is required' } })
    if (!isLocale(targetLocale)) return res.status(400).json({ success: false, error: { message: 'targetLocale must be one of en, fr, de, it, es' } })

    const storeId = req.storeId ?? (await prisma.store.findFirst())?.id
    const theme = await prisma.theme.findUnique({ where: { storeId_slug: { storeId: storeId!, slug } } })
    if (!theme) return res.status(404).json({ success: false, error: { message: 'Theme not found' } })

    const entries = extractThemeStrings(theme.sections)
    const translated = await translateThemeStrings(entries, targetLocale)

    res.json({ success: true, data: translated })
  } catch (err) { next(err) }
})

export default router
