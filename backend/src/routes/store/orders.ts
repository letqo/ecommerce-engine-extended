import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireCustomer, CustomerRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'

const router = Router()

// GET /api/store/orders/:orderNumber/status (public — for order confirmation page)
router.get('/:orderNumber/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNumber = parseInt(req.params.orderNumber)
    const email = req.query.email as string
    if (!email) throw createError('Email required', 400, 'EMAIL_REQUIRED')

    const order = await prisma.order.findFirst({
      where: {
        orderNumber,
        OR: [{ guestEmail: email }, { customer: { email } }],
      },
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true,
        fulfillmentStatus: true, total: true, currency: true, trackingNumber: true,
        trackingUrl: true, shippingAddress: true, items: { select: { title: true, variantTitle: true, quantity: true, price: true, imageUrl: true } },
        createdAt: true,
      },
    })
    if (!order) throw createError('Order not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
})

// GET /api/store/orders (customer's own orders)
router.get('/', requireCustomer, async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: req.customer!.customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNumber: true, status: true, total: true, currency: true,
        trackingNumber: true, items: { select: { title: true, quantity: true, imageUrl: true } },
        createdAt: true,
      },
    })
    res.json({ success: true, data: orders })
  } catch (err) { next(err) }
})

export default router
