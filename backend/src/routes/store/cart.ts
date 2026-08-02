import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { optionalCustomer, CustomerRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { AliExpressAdapter } from '../../suppliers/AliExpressAdapter'
import { CJAdapter } from '../../suppliers/CJAdapter'

const router = Router()
router.use(optionalCustomer)

const getOrCreateCart = async (req: CustomerRequest) => {
  const customerId = req.customer?.customerId
  const sessionId = req.headers['x-session-id'] as string
  const storeId = req.storeId

  if (!customerId && !sessionId) throw createError('Session ID required', 400, 'NO_SESSION')

  const where = customerId ? { customerId } : { sessionId }
  let cart = await prisma.cart.findFirst({ where, include: { items: { include: { variant: { include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' as const } } } } } } } } } })

  if (!cart) {
    cart = await prisma.cart.create({
      data: customerId ? { customerId, storeId } : { sessionId, storeId },
      include: { items: { include: { variant: { include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' as const } } } } } } } } },
    })
  }
  return cart
}

// GET /api/store/cart
router.get('/', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const cart = await getOrCreateCart(req)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
})

// POST /api/store/cart/items
router.post('/items', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { variantId, quantity } = z.object({ variantId: z.string(), quantity: z.number().int().positive() }).parse(req.body)

    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, product: { storeId: req.storeId } }, include: { product: true } })
    if (!variant || variant.product.status !== 'ACTIVE') throw createError('Product not available', 404, 'NOT_FOUND')
    if (variant.trackInventory && !variant.allowBackorder && variant.inventoryQty < quantity) {
      throw createError('Not enough stock', 400, 'OUT_OF_STOCK')
    }

    const cart = await getOrCreateCart(req)

    const existing = cart.items.find((i) => i.variantId === variantId)
    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } })
    } else {
      await prisma.cartItem.create({ data: { cartId: cart.id, variantId, quantity } })
    }

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { variant: { include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } } } } } } },
    })
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

// PUT /api/store/cart/items/:itemId
router.put('/items/:itemId', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { quantity } = z.object({ quantity: z.number().int().min(0) }).parse(req.body)
    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: req.params.itemId } })
    } else {
      await prisma.cartItem.update({ where: { id: req.params.itemId }, data: { quantity } })
    }
    res.json({ success: true })
  } catch (err) { next(err) }
})

// DELETE /api/store/cart/items/:itemId
router.delete('/items/:itemId', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.cartItem.delete({ where: { id: req.params.itemId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/store/cart/validate
router.post('/validate', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { items } = z.object({
      items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })),
    }).parse(req.body)

    const issues: { variantId: string; title: string; requested: number; available: number }[] = []

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: items.map((i) => i.variantId) }, product: { storeId: req.storeId } },
      include: { product: { select: { id: true, title: true, status: true, cjProductId: true, aliexpressProductId: true, storeId: true } } },
    })

    // For supplier-linked products, fetch live stock in parallel
    const supplierStockMap = new Map<string, number | null>()
    const supplierChecks: Promise<void>[] = []

    for (const variant of variants) {
      const p = variant.product
      if (p.cjProductId && variant.cjVariantId) {
        supplierChecks.push(
          (async () => {
            try {
              const cj = new CJAdapter()
              if (p.storeId) cj.withStore(p.storeId)
              const product = await cj.getProduct(p.cjProductId!)
              const sv = product.variants.find((v) => v.supplierId === variant.cjVariantId)
              if (sv?.stock != null) {
                supplierStockMap.set(variant.id, sv.stock)
                await prisma.productVariant.update({ where: { id: variant.id }, data: { inventoryQty: sv.stock } })
              }
            } catch {}
          })()
        )
      } else if (p.aliexpressProductId && variant.aliexpressSkuId) {
        supplierChecks.push(
          (async () => {
            try {
              const ae = new AliExpressAdapter()
              if (p.storeId) ae.withStore(p.storeId)
              const product = await ae.getProduct(p.aliexpressProductId!)
              const sv = product.variants.find((v) => v.supplierId === variant.aliexpressSkuId)
              if (sv?.stock != null) {
                supplierStockMap.set(variant.id, sv.stock)
                await prisma.productVariant.update({ where: { id: variant.id }, data: { inventoryQty: sv.stock } })
              }
            } catch {}
          })()
        )
      }
    }

    await Promise.allSettled(supplierChecks)

    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variantId)
      if (!variant || variant.product.status !== 'ACTIVE') {
        issues.push({ variantId: item.variantId, title: variant?.product.title ?? 'Unknown', requested: item.quantity, available: 0 })
        continue
      }
      const liveStock = supplierStockMap.get(variant.id) ?? variant.inventoryQty
      if (variant.trackInventory && !variant.allowBackorder && liveStock < item.quantity) {
        issues.push({ variantId: item.variantId, title: variant.product.title, requested: item.quantity, available: liveStock })
      }
    }

    res.json({ success: true, data: { valid: issues.length === 0, issues } })
  } catch (err) { next(err) }
})

// POST /api/store/cart/coupon
router.post('/coupon', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body)
    const discount = await prisma.discount.findFirst({
      where: {
        storeId: req.storeId,
        code: { equals: code, mode: 'insensitive' },
        isActive: true,
        OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
      },
    })
    if (!discount) throw createError('Invalid or expired coupon', 400, 'INVALID_COUPON')
    if (discount.maxUses && discount.usedCount >= discount.maxUses) throw createError('Coupon limit reached', 400, 'COUPON_EXHAUSTED')
    const cart = await getOrCreateCart(req)
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } })
    res.json({ success: true, data: { discount: { type: discount.type, value: discount.value } } })
  } catch (err) { next(err) }
})

export default router
