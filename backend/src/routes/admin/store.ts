import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { LOCALES } from '../../lib/locales'

const router = Router()

const storeTranslationSchema = z.object({
  locale: z.enum(LOCALES),
  aboutUs: z.string().optional().nullable(),
  shippingPolicy: z.string().optional().nullable(),
  returnPolicy: z.string().optional().nullable(),
  privacyPolicy: z.string().optional().nullable(),
  termsOfService: z.string().optional().nullable(),
  faqContent: z.string().optional().nullable(),
})

// Shared by the REST route and the setup-assistant tool dispatcher.
// `data.translations`, if present, is parsed and diffed against StoreTranslation separately —
// callers that never pass translations (e.g. the assistant's tools) are unaffected.
export async function updateStore(storeId: string | undefined, data: Record<string, any>) {
  const { translations, ...rest } = data
  const parsedTranslations = translations !== undefined
    ? z.array(storeTranslationSchema).parse(translations)
    : undefined

  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId } })
    : await prisma.store.findFirst()

  return prisma.$transaction(async (tx) => {
    const s = store
      ? await tx.store.update({ where: { id: store.id }, data: rest })
      : await tx.store.create({ data: { id: 'default', ...rest } })

    if (parsedTranslations !== undefined) {
      await tx.storeTranslation.deleteMany({ where: { storeId: s.id } })
      if (parsedTranslations.length > 0) {
        await tx.storeTranslation.createMany({ data: parsedTranslations.map((t) => ({ ...t, storeId: s.id })) })
      }
    }

    return tx.store.findUnique({ where: { id: s.id }, include: { translations: true } })
  })
}

export async function createStore(input: { name: string; currency?: string; currencySymbol?: string; shipToCountry?: string; sourcingCurrency?: string }) {
  const { name, currency = 'USD', currencySymbol = '$', shipToCountry = 'US', sourcingCurrency = 'USD' } = input
  if (!name?.trim()) throw createError('Store name is required', 400)
  return prisma.store.create({ data: { name: name.trim(), currency, currencySymbol, shipToCountry, sourcingCurrency } })
}

router.use(requireAdmin)

// GET /api/admin/store — current store settings
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const store = req.storeId
      ? await prisma.store.findUnique({ where: { id: req.storeId }, include: { translations: true } })
      : await prisma.store.findFirst({ include: { translations: true } })
    res.json({ success: true, data: store })
  } catch (err) { next(err) }
})

// PUT /api/admin/store — update current store settings
router.put('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await updateStore(req.storeId, req.body)
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

// GET /api/admin/store/all — list all stores (for switcher)
router.get('/all', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const stores = await prisma.store.findMany({
      select: { id: true, name: true, currency: true, shipToCountry: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: stores })
  } catch (err) { next(err) }
})

// POST /api/admin/store/create — create a new store
router.post('/create', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const store = await createStore(req.body)
    res.status(201).json({ success: true, data: store })
  } catch (err) { next(err) }
})

export default router
