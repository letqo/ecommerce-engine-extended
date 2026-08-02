import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../../config/database'
import { CJAdapter } from '../../suppliers/CJAdapter'

const router = Router()

function verifySignature(body: string, signature: string): boolean {
  const openId = CJAdapter.openId
  if (!openId || !signature) return false
  const expected = crypto
    .createHmac('sha256', openId)
    .update(body)
    .digest('base64')
  return expected === signature
}

router.post('/', async (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const rawBody = JSON.stringify(body)
  const signature = req.headers['sign'] as string

  if (CJAdapter.openId && !verifySignature(rawBody, signature)) {
    console.error('[CJ Webhook] Invalid signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Respond immediately — CJ requires < 3 seconds
  res.json({ success: true })

  const { type, messageType, params } = body
  if (!type) {
    console.error('[CJ Webhook] Received request with no type — ignoring')
    return
  }
  console.log(`[CJ Webhook] ${type}/${messageType}`)

  try {
    switch (type) {
      case 'STOCK':
        await handleStockUpdate(params)
        break
      case 'PRODUCT':
        await handleProductChange(params)
        break
      case 'ORDER':
        await handleOrderUpdate(params)
        break
      case 'LOGISTICS':
        await handleLogisticsUpdate(params)
        break
    }
  } catch (err: any) {
    console.error(`[CJ Webhook] Error handling ${type}:`, err.message)
  }
})

async function handleStockUpdate(params: any) {
  const vid = params.vid ?? params.variantId
  const stock = params.totalInventory ?? params.inventoryNum ?? params.stock
  if (!vid || stock == null) return

  // The same CJ variant can be imported by more than one store — update every match, not just the first.
  const variants = await prisma.productVariant.findMany({ where: { cjVariantId: vid } })
  for (const variant of variants) {
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { inventoryQty: Number(stock) },
    })
  }
  console.log(`[CJ Webhook] Stock updated: variant ${vid} → ${stock} (${variants.length} store(s))`)
}

async function handleProductChange(params: any) {
  const pid = params.pid ?? params.productId
  if (!pid) return

  // The same CJ product can be imported by more than one store — apply the change to every match.
  const products = await prisma.product.findMany({ where: { cjProductId: pid } })

  for (const product of products) {
    if (params.status === 'REMOVED' || params.status === 'OFF_SHELF') {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: 'ARCHIVED',
          syncAlert: 'Product removed by CJ — archived via webhook',
          lastSyncedAt: new Date(),
        },
      })
      console.log(`[CJ Webhook] Product archived: ${product.title}`)
      continue
    }

    // Price change — update variant costs
    if (params.variants && Array.isArray(params.variants)) {
      for (const v of params.variants) {
        const vid = v.vid ?? v.variantId
        const cost = v.variantSellPrice ?? v.sellPrice
        if (!vid || cost == null) continue

        const variant = await prisma.productVariant.findFirst({ where: { cjVariantId: vid, productId: product.id } })
        if (!variant) continue

        const updates: any = { costPerItem: Number(cost) }
        if (Number(cost) > variant.price) {
          await prisma.product.update({
            where: { id: product.id },
            data: { syncAlert: `Variant "${variant.title}": CJ cost $${Number(cost).toFixed(2)} exceeds your price $${variant.price.toFixed(2)}` },
          })
        }
        await prisma.productVariant.update({ where: { id: variant.id }, data: updates })
      }
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { lastSyncedAt: new Date() },
    })
    console.log(`[CJ Webhook] Product updated: ${product.title}`)
  }
}

async function handleOrderUpdate(params: any) {
  const cjOrderId = params.orderId ?? params.cjOrderCode
  const status = params.orderStatus ?? params.status
  if (!cjOrderId) return

  const order = await prisma.order.findFirst({ where: { cjOrderId } })
  if (!order) return

  await prisma.order.update({
    where: { id: order.id },
    data: { cjOrderStatus: status },
  })
  console.log(`[CJ Webhook] Order ${order.orderNumber} status → ${status}`)
}

async function handleLogisticsUpdate(params: any) {
  const cjOrderId = params.orderId ?? params.cjOrderCode
  const trackingNumber = params.trackNumber ?? params.trackingNumber
  if (!cjOrderId) return

  const order = await prisma.order.findFirst({ where: { cjOrderId } })
  if (!order) return

  const updates: any = { cjOrderStatus: params.orderStatus ?? 'SHIPPED' }

  if (trackingNumber && !order.trackingNumber) {
    updates.trackingNumber = trackingNumber
    updates.trackingUrl = params.trackingUrl ?? null
    updates.status = 'SHIPPED'
    updates.fulfillmentStatus = 'FULFILLED'

    await prisma.orderTimeline.create({
      data: {
        orderId: order.id,
        message: `Shipped via ${params.logisticName ?? 'carrier'} — tracking: ${trackingNumber}`,
        createdBy: 'system',
      },
    })

    // Send shipping email
    import('../../services/email').then(({ sendShippingEmail, sendReviewInvitationEmail }) => {
      sendShippingEmail(order.id).catch(() => {})
      sendReviewInvitationEmail(order.id).catch(() => {})
    })
  }

  await prisma.order.update({ where: { id: order.id }, data: updates })
  console.log(`[CJ Webhook] Logistics for order ${order.orderNumber}: tracking=${trackingNumber ?? 'none'}`)
}

export default router
