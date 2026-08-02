import { Router, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { stripe } from '../../config/stripe'
import { getAdapter } from '../../suppliers/registry'
import { AliExpressAdapter } from '../../suppliers/AliExpressAdapter'
import { checkBeforeFulfillment } from '../../services/supplierSync'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/orders
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined

    const where: any = { storeId: req.storeId }
    if (status) where.status = status
    if (search) {
      const num = parseInt(search)
      where.OR = [
        ...(isNaN(num) ? [] : [{ orderNumber: num }]),
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { email: true, firstName: true, lastName: true } },
          items: { select: { title: true, quantity: true, price: true } },
        },
      }),
    ])

    res.json({ success: true, data: orders, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/admin/orders/:id
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: {
        customer: true,
        items: { include: { variant: { include: { product: true } } } },
        timeline: { orderBy: { createdAt: 'asc' } },
        refunds: true,
        discount: true,
      },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
})

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function fulfillOrder(storeId: string | undefined, orderId: string, trackingNumber: string, trackingUrl: string | undefined, createdBy: string) {
  const existing = await prisma.order.findFirst({ where: { id: orderId, storeId } })
  if (!existing) throw createError('Order not found', 404, 'NOT_FOUND')

  const orderItems = await prisma.orderItem.findMany({
    where: { orderId, reviewToken: null },
    select: { id: true },
  })

  await Promise.all(
    orderItems.map((item) =>
      prisma.orderItem.update({
        where: { id: item.id },
        data: { reviewToken: crypto.randomBytes(32).toString('hex') },
      })
    )
  )

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      trackingUrl,
      status: 'SHIPPED',
      fulfillmentStatus: 'FULFILLED',
      shippedAt: existing.shippedAt ?? new Date(),
      timeline: { create: { message: `Tracking number added: ${trackingNumber}`, createdBy } },
    },
  })

  import('../../services/email').then(({ sendShippingEmail, sendReviewInvitationEmail }) => {
    sendShippingEmail(order.id).catch((e: Error) => console.error('Shipping email error:', e.message))
    sendReviewInvitationEmail(order.id).catch((e: Error) => console.error('Review invitation email error:', e.message))
  })

  return order
}

export async function addOrderNote(storeId: string | undefined, orderId: string, message: string, createdBy: string) {
  const existing = await prisma.order.findFirst({ where: { id: orderId, storeId } })
  if (!existing) throw createError('Order not found', 404, 'NOT_FOUND')
  return prisma.order.update({
    where: { id: orderId },
    data: { timeline: { create: { message, createdBy } } },
  })
}

// PATCH /api/admin/orders/:id/fulfill
router.patch('/:id/fulfill', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { trackingNumber, trackingUrl } = z.object({
      trackingNumber: z.string().min(1),
      trackingUrl: z.string().optional(),
    }).parse(req.body)

    const order = await fulfillOrder(req.storeId, req.params.id, trackingNumber, trackingUrl, req.admin!.email)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
})

// POST /api/admin/orders/:id/note — freeform timeline note
router.post('/:id/note', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body)
    const order = await addOrderNote(req.storeId, req.params.id, message, req.admin!.email)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
})

// PATCH /api/admin/orders/:id/cancel
router.patch('/:id/cancel', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      throw createError('Cannot cancel a shipped order', 400, 'INVALID_STATUS')
    }

    await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        timeline: { create: { message: 'Order cancelled', createdBy: req.admin!.email } },
      },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/admin/orders/:id/fulfill-cj
router.post('/:id/fulfill-cj', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { items: { include: { variant: true } } },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    if (order.cjOrderId) throw createError('Already submitted to CJ (order ID: ' + order.cjOrderId + ')', 400, 'ALREADY_FULFILLED')

    const cjItems = order.items.filter((item) => item.variant?.cjVariantId)
    if (cjItems.length === 0) throw createError('No CJ products found in this order. Only products imported from CJ can be fulfilled this way.', 400, 'NO_CJ_PRODUCTS')

    const preflight = await checkBeforeFulfillment(order.id)
    if (!preflight.ok && !req.body.force) {
      return res.status(409).json({ success: false, code: 'SYNC_WARNING', warnings: preflight.warnings })
    }

    const addr = order.shippingAddress as any
    const cj = getAdapter('cj')

    const result = await cj.placeOrder({
      ourOrderId: String(order.orderNumber),
      shippingAddress: {
        firstName: addr.firstName ?? '',
        lastName: addr.lastName ?? '',
        address1: addr.address1 ?? '',
        address2: addr.address2 ?? '',
        city: addr.city ?? '',
        province: addr.province ?? '',
        postalCode: addr.postalCode ?? '',
        countryCode: addr.country ?? '',
        phone: addr.phone ?? '',
      },
      items: cjItems.map((item) => ({
        variantSupplierId: item.variant!.cjVariantId!,
        quantity: item.quantity,
      })),
    })

    // If order also has AliExpress items not yet submitted, use PARTIALLY_FULFILLED
    const hasUnfulfilledAE = order.items.some(
      (item) => (item.variant?.aliexpressSkuId || item.variant?.aliexpressSkuAttr) && !order.aliexpressOrderId
    )
    const fulfillmentStatus = hasUnfulfilledAE ? 'PARTIALLY_FULFILLED' : 'FULFILLED'

    await prisma.order.update({
      where: { id: order.id },
      data: {
        cjOrderId: result.supplierOrderId,
        cjOrderStatus: result.status,
        status: 'PROCESSING',
        fulfillmentStatus,
        timeline: {
          create: {
            message: `Submitted to CJ Dropshipping — CJ order ID: ${result.supplierOrderId}`,
            createdBy: req.admin!.email,
          },
        },
      },
    })

    res.json({ success: true, data: { cjOrderId: result.supplierOrderId } })
  } catch (err) { next(err) }
})

// POST /api/admin/orders/:id/fulfill-aliexpress
router.post('/:id/fulfill-aliexpress', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    if (order.aliexpressOrderId) throw createError('Already submitted to AliExpress (order ID: ' + order.aliexpressOrderId + ')', 400, 'ALREADY_FULFILLED')

    const aeItems = order.items.filter(
      (item) => item.variant?.product?.aliexpressProductId && (item.variant?.aliexpressSkuId || item.variant?.aliexpressSkuAttr)
    )
    if (aeItems.length === 0) throw createError('No AliExpress products found in this order. Only products imported from AliExpress can be fulfilled this way.', 400, 'NO_ALIEXPRESS_PRODUCTS')

    const preflight = await checkBeforeFulfillment(order.id)
    if (!preflight.ok && !req.body.force) {
      return res.status(409).json({ success: false, code: 'SYNC_WARNING', warnings: preflight.warnings })
    }

    const addr = order.shippingAddress as any
    const ae = new AliExpressAdapter()
    if (req.storeId) ae.withStore(req.storeId)

    const result = await ae.placeOrder({
      ourOrderId: String(order.orderNumber),
      shippingAddress: {
        firstName: addr.firstName ?? '',
        lastName: addr.lastName ?? '',
        address1: addr.address1 ?? '',
        address2: addr.address2 ?? '',
        city: addr.city ?? '',
        province: addr.province ?? '',
        postalCode: addr.postalCode ?? '',
        countryCode: addr.country ?? '',
        phone: addr.phone ?? '',
      },
      items: aeItems.map((item) => ({
        variantSupplierId: `${item.variant!.product!.aliexpressProductId}:::${item.variant!.aliexpressSkuAttr ?? ''}`,
        quantity: item.quantity,
      })),
    })

    // If order also has CJ items not yet submitted, use PARTIALLY_FULFILLED
    const hasUnfulfilledCJ = order.items.some(
      (item) => item.variant?.cjVariantId && !order.cjOrderId
    )
    const fulfillmentStatus = hasUnfulfilledCJ ? 'PARTIALLY_FULFILLED' : 'FULFILLED'

    await prisma.order.update({
      where: { id: order.id },
      data: {
        aliexpressOrderId: result.supplierOrderId,
        aliexpressOrderStatus: result.status,
        status: 'PROCESSING',
        fulfillmentStatus,
        timeline: {
          create: {
            message: `Submitted to AliExpress — order ID: ${result.supplierOrderId}`,
            createdBy: req.admin!.email,
          },
        },
      },
    })

    res.json({ success: true, data: { aliexpressOrderId: result.supplierOrderId } })
  } catch (err) { next(err) }
})

// Shared by the REST route, the damage-claims flow (manual + AI auto-approval), and
// the setup-assistant tool dispatcher.
export async function issueRefund(storeId: string | undefined, orderId: string, amount: number, reason: string | undefined, createdBy: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId }, include: { refunds: true } })
  if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') throw createError('Order not paid', 400, 'NOT_PAID')

  const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0)
  const refundable = order.total - alreadyRefunded
  if (amount > refundable + 0.01) {
    throw createError(`Amount exceeds refundable balance ($${refundable.toFixed(2)})`, 400, 'EXCEEDS_REFUNDABLE')
  }

  let stripeRefundId: string | undefined
  if (order.stripePaymentIntentId) {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: Math.round(amount * 100),
    })
    stripeRefundId = refund.id
  }

  const [createdRefund] = await prisma.$transaction([
    prisma.refund.create({ data: { orderId: order.id, amount, reason, stripeRefundId } }),
    prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: alreadyRefunded + amount >= order.total ? 'FULLY_REFUNDED' : 'PARTIALLY_REFUNDED',
        timeline: { create: { message: `Refund of $${amount.toFixed(2)} issued${reason ? ` — ${reason}` : ''}`, createdBy } },
      },
    }),
  ])

  return createdRefund
}

// POST /api/admin/orders/:id/refund
router.post('/:id/refund', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { amount, reason } = z.object({ amount: z.number().positive(), reason: z.string().optional() }).parse(req.body)
    await issueRefund(req.storeId, req.params.id, amount, reason, req.admin!.email)
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
