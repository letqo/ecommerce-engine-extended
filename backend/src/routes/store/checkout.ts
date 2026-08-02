import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { stripe } from '../../config/stripe'
import { optionalCustomer, CustomerRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { calculateOrder } from '../../utils/calculateOrder'
import { estimateDeliveryForCountry } from '../../services/shippingAvailability'
import { ensureSubscriber } from './newsletter'
import { z } from 'zod'

const router = Router()
router.use(optionalCustomer)

const addressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  province: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(2),
  phone: z.string().optional(),
})

const checkoutSchema = z.object({
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  shippingRateId: z.string().optional(),
  couponCode: z.string().optional(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
})

// POST /api/store/checkout/payment-intent
router.post('/payment-intent', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const data = checkoutSchema.parse(req.body)
    const storeId = req.storeId

    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { currency: true } })
      : await prisma.store.findFirst({ select: { currency: true } })
    const currency = (store?.currency ?? 'USD').toLowerCase()

    const { items, subtotal, discountAmount, shippingAmount, taxAmount, total, discountId } =
      await calculateOrder(data.items, data.couponCode, data.shippingRateId, storeId, data.shippingAddress.country)

    const customerId = req.customer?.customerId || null
    const customer = customerId ? await prisma.customer.findUnique({ where: { id: customerId } }) : null

    const order = await prisma.order.create({
      data: {
        storeId,
        customerId,
        guestEmail: customer ? null : data.email,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        currency: currency.toUpperCase(),
        subtotal,
        discountAmount,
        shippingAmount,
        taxAmount,
        total,
        discountId,
        shippingAddress: data.shippingAddress,
        billingAddress: data.billingAddress || data.shippingAddress,
        items: { create: items },
        timeline: { create: { message: 'Order created', createdBy: 'system' } },
      },
    })

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency,
      metadata: { orderId: order.id, orderNumber: String(order.orderNumber) },
      receipt_email: data.email,
    })

    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    })

    ensureSubscriber(data.email, storeId, 'checkout', data.shippingAddress.firstName).catch(() => {})

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        orderId: order.id,
        orderNumber: order.orderNumber,
        total,
        subtotal,
        discountAmount,
        shippingAmount,
        taxAmount,
      },
    })
  } catch (err) { next(err) }
})

// POST /api/store/checkout/delivery-estimate — real per-country delivery window for the
// cart's current items, computed against the customer's actual entered address (not the
// store's default ship-to country used for the generic estimate shown on product pages).
router.post('/delivery-estimate', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { items, country } = z.object({
      items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
      country: z.string().min(2),
    }).parse(req.body)

    const estimate = await estimateDeliveryForCountry(items, country.toUpperCase(), req.storeId)
    res.json({ success: true, data: estimate })
  } catch (err) { next(err) }
})

// POST /api/store/checkout/validate-coupon
router.post('/validate-coupon', async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const { code, subtotal } = z.object({
      code: z.string().min(1),
      subtotal: z.number().positive(),
    }).parse(req.body)

    const storeId = req.storeId
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { currencySymbol: true } })
      : await prisma.store.findFirst({ select: { currencySymbol: true } })
    const symbol = store?.currencySymbol ?? '$'

    const discount = await prisma.discount.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        storeId,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
      },
    })

    if (!discount) {
      return res.json({ success: true, data: { valid: false, reason: 'Invalid coupon code' } })
    }

    if (discount.endsAt && discount.endsAt < new Date()) {
      return res.json({ success: true, data: { valid: false, reason: 'This coupon has expired' } })
    }

    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      return res.json({ success: true, data: { valid: false, reason: 'This coupon has reached its usage limit' } })
    }

    if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
      return res.json({ success: true, data: { valid: false, reason: `Minimum order amount is ${symbol}${discount.minOrderAmount.toFixed(2)}` } })
    }

    const discountAmount =
      discount.type === 'PERCENTAGE'
        ? Math.round(subtotal * (discount.value / 100) * 100) / 100
        : discount.type === 'FIXED_AMOUNT'
          ? Math.min(discount.value, subtotal)
          : 0

    const label =
      discount.type === 'PERCENTAGE'
        ? `${discount.value}% off`
        : discount.type === 'FIXED_AMOUNT'
          ? `${symbol}${discount.value.toFixed(2)} off`
          : 'Free shipping'

    res.json({
      success: true,
      data: { valid: true, discountAmount, label, type: discount.type },
    })
  } catch (err) { next(err) }
})

// GET /api/store/checkout/shipping-rates
router.get('/shipping-rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const country = (req.query.country as string) || 'US'
    const zones = await prisma.shippingZone.findMany({
      where: { storeId, countries: { has: country } },
      include: { rates: { orderBy: { price: 'asc' } } },
    })
    const rates = zones.flatMap((z) => z.rates)
    res.json({ success: true, data: rates })
  } catch (err) { next(err) }
})

export default router
