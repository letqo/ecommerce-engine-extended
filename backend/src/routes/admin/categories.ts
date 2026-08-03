import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { LOCALES } from '../../lib/locales'

const router = Router()

export const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().optional(),
  isVisible: z.boolean().optional(),
  // Every product in this category inherits this profile unless it sets its own. Changing it
  // can put already-live products out of compliance — the Store Health audit surfaces that.
  complianceProfile: z.enum(['NONE', 'COSMETICS', 'ELECTRONICS', 'TOYS_CHILDREN', 'FOOD_CONTACT', 'TEXTILE']).optional(),
  translations: z.array(z.object({
    locale: z.enum(LOCALES),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
  })).default([]),
})

export const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '')

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function createCategory(storeId: string | undefined, input: unknown) {
  const { translations, ...data } = categorySchema.parse(input)
  const slug = data.slug || slugify(data.name)
  const exists = await prisma.category.findFirst({ where: { slug, storeId } })
  if (exists) throw createError('Slug already in use', 400, 'DUPLICATE_SLUG')
  return prisma.category.create({
    data: { ...data, slug, storeId, translations: { create: translations } },
    include: { translations: true },
  })
}

export async function updateCategory(storeId: string | undefined, categoryId: string, input: unknown) {
  const { translations, ...data } = categorySchema.partial().parse(input)
  const existing = await prisma.category.findFirst({ where: { id: categoryId, storeId } })
  if (!existing) throw createError('Category not found', 404, 'NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    if (translations !== undefined) {
      await tx.categoryTranslation.deleteMany({ where: { categoryId } })
      if (translations.length > 0) {
        await tx.categoryTranslation.createMany({ data: translations.map((t) => ({ ...t, categoryId })) })
      }
    }
    return tx.category.update({ where: { id: categoryId }, data, include: { translations: true } })
  })
}

router.use(requireAdmin)

// GET /api/admin/categories
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      where: { storeId: req.storeId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } }, translations: true },
    })
    res.json({ success: true, data: categories })
  } catch (err) { next(err) }
})

// POST /api/admin/categories
router.post('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const category = await createCategory(req.storeId, req.body)
    res.status(201).json({ success: true, data: category })
  } catch (err) { next(err) }
})

// PUT /api/admin/categories/:id
router.put('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const category = await updateCategory(req.storeId, req.params.id, req.body)
    res.json({ success: true, data: category })
  } catch (err) { next(err) }
})

// DELETE /api/admin/categories/:id
router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.category.deleteMany({ where: { id: req.params.id, storeId: req.storeId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
