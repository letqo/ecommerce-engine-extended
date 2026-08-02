import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { stripe } from '../../config/stripe'
import { prisma } from '../../config/database'
import { env } from '../../config/env'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const orderId = pi.metadata.orderId
    const order = await prisma.order.findUnique({ where: { id: orderId } })

    if (!order || order.paymentStatus === 'PAID') return res.json({ received: true })

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paymentMethod: 'stripe',
          timeline: { create: { message: `Payment of $${(pi.amount / 100).toFixed(2)} received`, createdBy: 'system' } },
        },
      })
      const items = await tx.orderItem.findMany({ where: { orderId } })
      for (const item of items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { inventoryQty: { decrement: item.quantity } },
        })
      }
      if (order.discountId) {
        await tx.discount.update({ where: { id: order.discountId }, data: { usedCount: { increment: 1 } } })
      }
    })

    // Send confirmation email (non-blocking)
    import('../../services/email').then(({ sendOrderConfirmationEmail }) =>
      sendOrderConfirmationEmail(orderId).catch((e: Error) => console.error('Email error:', e.message))
    )

    // Forward to suppliers sequentially to avoid race conditions on fulfillmentStatus
    ;(async () => {
      try {
        const { fulfillOrderWithCJ } = await import('../../services/cjdropshipping')
        await fulfillOrderWithCJ(orderId)
      } catch (e: any) { console.error('CJ fulfillment error:', e.message) }
      try {
        const { fulfillOrderWithAliExpress } = await import('../../services/aliexpressFulfillment')
        await fulfillOrderWithAliExpress(orderId)
      } catch (e: any) { console.error('AliExpress fulfillment error:', e.message) }
    })()
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    const orderId = pi.metadata.orderId
    if (orderId) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'FAILED',
          timeline: { create: { message: 'Payment failed', createdBy: 'system' } },
        },
      }).catch(() => {})
    }
  }

  res.json({ received: true })
})

export default router
