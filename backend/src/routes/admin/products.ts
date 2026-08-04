import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { LOCALES } from '../../lib/locales'
import {
  resolveComplianceProfile, findMissingComplianceFields, describeMissingFields,
} from '../../lib/complianceProfiles'
import { Prisma } from '@prisma/client'
import type { ComplianceProfile } from '@prisma/client'

const router = Router()
router.use(requireAdmin)

const COMPLIANCE_PROFILE_VALUES = ['NONE', 'COSMETICS', 'ELECTRONICS', 'TOYS_CHILDREN', 'FOOD_CONTACT', 'TEXTILE'] as const

// Prisma distinguishes "leave this JSON column alone" (undefined) from "write SQL NULL"
// (Prisma.DbNull); a plain `null` is rejected at the type level. The API accepts null as
// "clear it", so translate here rather than leaking Prisma's sentinel into the request schema.
function jsonColumnInput(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

// Publish gate: a product may only be ACTIVE once every field its resolved compliance profile
// requires is filled in. Called from create, update and the status PATCH, so there's no way to
// reach ACTIVE that skips it. DRAFT and ARCHIVED are never blocked — half-finished compliance
// data is exactly what a draft is for.
async function assertCompliantForActive(
  db: Prisma.TransactionClient | typeof prisma,
  next: {
    status?: string | null
    categoryId?: string | null
    complianceProfile?: ComplianceProfile | null
    complianceData?: unknown
  }
) {
  if (next.status !== 'ACTIVE') return

  const categoryProfile = next.categoryId
    ? (await db.category.findUnique({ where: { id: next.categoryId }, select: { complianceProfile: true } }))?.complianceProfile
    : null

  const profile = resolveComplianceProfile(next.complianceProfile, categoryProfile)
  if (profile === 'NONE') return

  const missing = findMissingComplianceFields(profile, next.complianceData)
  if (missing.length > 0) {
    throw createError(describeMissingFields(profile, missing), 400, 'COMPLIANCE_INCOMPLETE')
  }
}

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '')

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  sku: z.string().optional().nullable(),
  price: z.number().positive(),
  compareAtPrice: z.number().optional().nullable(),
  costPerItem: z.number().optional().nullable(),
  inventoryQty: z.number().int().default(0),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  imageUrl: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  barcode: z.string().optional().nullable(),
  cjVariantId: z.string().optional().nullable(),
  // Generic supplier variant/SKU reference for configurable suppliers (Printful, Gelato,
  // BigBuy, WooCommerce bridge). CJ/AliExpress keep their own dedicated fields.
  supplierVariantRef: z.string().optional().nullable(),
  options: z.record(z.string()).default({}),
})

export const productSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  categoryId: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  vendor: z.string().optional().nullable(),
  productType: z.string().optional().nullable(),
  isFeatured: z.boolean().default(false),
  listVariantsIndividually: z.boolean().default(false),
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  weight: z.number().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  deliveryMinDays: z.coerce.number().int().min(0).optional().nullable(),
  deliveryMaxDays: z.coerce.number().int().min(0).optional().nullable(),
  cjProductId: z.string().optional().nullable(),
  cjProductUrl: z.string().optional().nullable(),
  // Which configurable supplier sources this product, if any.
  supplierKey: z.enum(['PRINTFUL', 'GELATO', 'BIGBUY', 'WOO_BRIDGE']).optional().nullable(),
  // Print-ready artwork for print-on-demand suppliers (currently: Gelato). See
  // GelatoAdapter.placeOrder and supplierOrderFulfillment.ts.
  printFiles: z.array(z.object({ type: z.string(), url: z.string() })).optional().nullable(),
  // Null means "inherit the category's profile"; an explicit NONE opts this product out of it.
  complianceProfile: z.enum(COMPLIANCE_PROFILE_VALUES).optional().nullable(),
  // Free-form key/value bag validated against the resolved profile's required fields, not
  // against a fixed shape — see lib/complianceProfiles.ts.
  complianceData: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().nullable(),
  images: z.array(z.object({
    id: z.string().optional(),
    url: z.string(),
    altText: z.string().optional().nullable(),
    sortOrder: z.number().default(0),
  })).default([]),
  variants: z.array(variantSchema).min(1),
  translations: z.array(z.object({
    locale: z.enum(LOCALES),
    title: z.string().optional().nullable(),
    shortDescription: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    metaTitle: z.string().optional().nullable(),
    metaDescription: z.string().optional().nullable(),
  })).default([]),
})

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function updateProduct(storeId: string | undefined, productId: string, input: unknown) {
  const data = productSchema.partial().parse(input)
  const { images, variants, translations, ...rest } = data

  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id: productId, storeId } })
    if (!existing) throw createError('Product not found', 404, 'NOT_FOUND')

    if (rest.cjProductId && existing.aliexpressProductId) {
      throw createError('This product is sourced from AliExpress — it cannot also be tagged as a CJ product.', 400, 'SUPPLIER_MISMATCH')
    }

    // Merge incoming over stored before checking: a partial update that only flips status to
    // ACTIVE must be validated against the compliance data already on the record.
    await assertCompliantForActive(tx, {
      status: rest.status ?? existing.status,
      categoryId: rest.categoryId !== undefined ? rest.categoryId : existing.categoryId,
      complianceProfile: rest.complianceProfile !== undefined ? rest.complianceProfile : existing.complianceProfile,
      complianceData: rest.complianceData !== undefined ? rest.complianceData : existing.complianceData,
    })

    if (images !== undefined) {
      await tx.productImage.deleteMany({ where: { productId } })
      await tx.productImage.createMany({
        data: images.map((img, i) => ({ ...img, productId, sortOrder: img.sortOrder ?? i })),
      })
    }

    if (variants !== undefined) {
      for (const v of variants) {
        if (v.cjVariantId && existing.aliexpressProductId) {
          throw createError('This product is sourced from AliExpress — its variants cannot be tagged with a CJ variant ID.', 400, 'SUPPLIER_MISMATCH')
        }
        if (v.id) {
          const { id, ...vData } = v
          await tx.productVariant.update({ where: { id }, data: vData })
        } else {
          await tx.productVariant.create({ data: { ...v, productId } })
        }
      }
    }

    if (translations !== undefined) {
      await tx.productTranslation.deleteMany({ where: { productId } })
      if (translations.length > 0) {
        await tx.productTranslation.createMany({ data: translations.map((t) => ({ ...t, productId })) })
      }
    }

    return tx.product.update({
      where: { id: productId },
      data: { ...rest, complianceData: jsonColumnInput(rest.complianceData), printFiles: jsonColumnInput(rest.printFiles) },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, translations: true },
    })
  }, { timeout: 20000, maxWait: 10000 })
}

export async function setProductStatus(storeId: string | undefined, productId: string, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') {
  if (status === 'ACTIVE') {
    const existing = await prisma.product.findFirst({
      where: { id: productId, storeId },
      select: { categoryId: true, complianceProfile: true, complianceData: true },
    })
    if (!existing) throw createError('Product not found', 404, 'NOT_FOUND')
    await assertCompliantForActive(prisma, { status, ...existing })
  }

  const result = await prisma.product.updateMany({ where: { id: productId, storeId }, data: { status } })
  if (result.count === 0) throw createError('Product not found', 404, 'NOT_FOUND')
  return prisma.product.findUnique({ where: { id: productId } })
}

// GET /api/admin/products
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const categoryId = req.query.categoryId as string | undefined

    const where: any = { storeId: req.storeId }
    if (status) where.status = status
    if (search) where.title = { contains: search, mode: 'insensitive' }
    if (categoryId) where.categoryId = categoryId === '__NONE__' ? null : categoryId

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: { select: { price: true, inventoryQty: true, trackInventory: true } },
          category: { select: { name: true } },
          translations: true,
        },
      }),
    ])

    res.json({ success: true, data: products, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/admin/products/:id
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
        options: { include: { values: true } },
        category: true,
        translations: true,
      },
    })
    if (!product) throw createError('Product not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: product })
  } catch (err) { next(err) }
})

// POST /api/admin/products
router.post('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const data = productSchema.parse(req.body)
    const storeId = req.storeId
    await assertCompliantForActive(prisma, data)
    const baseSlug = data.slug || slugify(data.title)

    // Ensure unique slug per store
    let slug = baseSlug
    let counter = 2
    while (await prisma.product.findFirst({ where: { slug, storeId } })) {
      slug = `${baseSlug}-${counter++}`
    }

    const { images, variants, translations, ...rest } = data

    const product = await prisma.product.create({
      data: {
        ...rest,
        complianceData: jsonColumnInput(rest.complianceData),
        printFiles: jsonColumnInput(rest.printFiles),
        slug,
        storeId,
        images: { create: images.map((img, i) => ({ ...img, sortOrder: img.sortOrder ?? i })) },
        variants: { create: variants },
        translations: { create: translations },
      },
      include: { images: true, variants: true, translations: true },
    })

    res.status(201).json({ success: true, data: product })
  } catch (err) { next(err) }
})

// PUT /api/admin/products/:id
router.put('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const product = await updateProduct(req.storeId, req.params.id, req.body)
    res.json({ success: true, data: product })
  } catch (err) { next(err) }
})

// DELETE /api/admin/products/:id
router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    // Check if any ACTIVE (non-cancelled) order items reference this product's variants
    const activeOrderItems = await prisma.orderItem.count({
      where: {
        variant: { productId: req.params.id },
        order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
    })
    if (activeOrderItems > 0) {
      throw createError(
        'This product has active orders and cannot be deleted. Archive it instead.',
        400,
        'HAS_ORDERS'
      )
    }

    // Remove order items from cancelled/refunded orders, cart items, then delete product
    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { variant: { productId: req.params.id } } }),
      prisma.cartItem.deleteMany({ where: { variant: { productId: req.params.id } } }),
      prisma.product.deleteMany({ where: { id: req.params.id, storeId: req.storeId } }),
    ])

    res.json({ success: true })
  } catch (err) { next(err) }
})

// PATCH /api/admin/products/:id/status
router.patch('/:id/status', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }).parse(req.body)
    const product = await setProductStatus(req.storeId, req.params.id, status)
    res.json({ success: true, data: product })
  } catch (err) { next(err) }
})

export default router
