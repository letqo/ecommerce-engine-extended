import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { stripe } from '../../config/stripe'
import { submitSupplierOrder, fulfillSupplierOrderManually, splitOrderIntoSupplierOrders } from '../../services/supplierOrderFulfillment'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/orders
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string | undefined
    const fulfillmentStatus = req.query.fulfillmentStatus as string | undefined
    const search = req.query.search as string | undefined

    const where: any = { storeId: req.storeId }
    if (status) where.status = status
    if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus
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
        supplierOrders: { include: { items: { include: { variant: { include: { product: true } } } } }, orderBy: { createdAt: 'asc' } },
        timeline: { orderBy: { createdAt: 'asc' } },
        refunds: true,
        discount: true,
      },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
})

export async function addOrderNote(storeId: string | undefined, orderId: string, message: string, createdBy: string) {
  const existing = await prisma.order.findFirst({ where: { id: orderId, storeId } })
  if (!existing) throw createError('Order not found', 404, 'NOT_FOUND')
  return prisma.order.update({
    where: { id: orderId },
    data: { timeline: { create: { message, createdBy } } },
  })
}

// PATCH /api/admin/orders/supplier-orders/:id/fulfill — enter tracking for one parcel
router.patch('/supplier-orders/:id/fulfill', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { trackingNumber, trackingUrl, carrier } = z.object({
      trackingNumber: z.string().min(1),
      trackingUrl: z.string().optional(),
      carrier: z.string().optional(),
    }).parse(req.body)

    const so = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!so) throw createError('Parcel not found', 404, 'NOT_FOUND')

    const updated = await fulfillSupplierOrderManually(so.id, { trackingNumber, trackingUrl, carrier }, req.admin!.email)
    res.json({ success: true, data: updated })
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

// POST /api/admin/orders/:id/fulfill-cj — submits (or retries) this order's CJ parcel
router.post('/:id/fulfill-cj', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')

    const supplierOrders = await splitOrderIntoSupplierOrders(order.id)
    const so = supplierOrders.find((s) => s.supplierKey === 'CJ')
    if (!so) throw createError('No CJ products found in this order. Only products imported from CJ can be fulfilled this way.', 400, 'NO_CJ_PRODUCTS')
    if (so.status === 'SUBMITTED' || so.status === 'SHIPPED') throw createError('Already submitted to CJ (order ID: ' + so.externalOrderId + ')', 400, 'ALREADY_FULFILLED')

    try {
      const updated = await submitSupplierOrder(so.id, { force: req.body.force })
      res.json({ success: true, data: { cjOrderId: updated.externalOrderId } })
    } catch (err: any) {
      if (err.code === 'SYNC_WARNING') return res.status(409).json({ success: false, code: 'SYNC_WARNING', warnings: err.warnings })
      throw err
    }
  } catch (err) { next(err) }
})

// POST /api/admin/orders/:id/fulfill-aliexpress — submits (or retries) this order's AliExpress parcel
router.post('/:id/fulfill-aliexpress', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')

    const supplierOrders = await splitOrderIntoSupplierOrders(order.id)
    const so = supplierOrders.find((s) => s.supplierKey === 'ALIEXPRESS')
    if (!so) throw createError('No AliExpress products found in this order. Only products imported from AliExpress can be fulfilled this way.', 400, 'NO_ALIEXPRESS_PRODUCTS')
    if (so.status === 'SUBMITTED' || so.status === 'SHIPPED') throw createError('Already submitted to AliExpress (order ID: ' + so.externalOrderId + ')', 400, 'ALREADY_FULFILLED')

    try {
      const updated = await submitSupplierOrder(so.id, { force: req.body.force })
      res.json({ success: true, data: { aliexpressOrderId: updated.externalOrderId } })
    } catch (err: any) {
      if (err.code === 'SYNC_WARNING') return res.status(409).json({ success: false, code: 'SYNC_WARNING', warnings: err.warnings })
      throw err
    }
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
