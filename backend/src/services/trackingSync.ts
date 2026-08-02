import { prisma } from '../config/database'
import { CJAdapter } from '../suppliers/CJAdapter'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'

interface TrackingSyncResult {
  checked: number
  updated: number
  errors: number
}

export async function runTrackingSync(): Promise<TrackingSyncResult> {
  const result: TrackingSyncResult = { checked: 0, updated: 0, errors: 0 }

  // CJ tracking is handled by webhooks — only poll as fallback for orders stuck > 24h
  await syncCJTrackingFallback(result)

  // AliExpress — batch query all pending orders at once
  await syncAliExpressBatch(result)

  if (result.checked > 0) {
    console.log(`[TrackingSync] Done — checked: ${result.checked}, updated: ${result.updated}, errors: ${result.errors}`)
  }

  return result
}

async function syncCJTrackingFallback(result: TrackingSyncResult) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const orders = await prisma.order.findMany({
    where: {
      cjOrderId: { not: null },
      trackingNumber: null,
      status: { in: ['CONFIRMED', 'PROCESSING'] },
      paymentStatus: 'PAID',
      updatedAt: { lt: oneDayAgo },
    },
    select: { id: true, orderNumber: true, cjOrderId: true },
    take: 20,
  })

  for (const order of orders) {
    result.checked++
    try {
      const cj = new CJAdapter()
      const info = await cj.getOrderStatus(order.cjOrderId!)
      if (!info.trackingNumber) continue

      await updateOrderWithTracking(order.id, {
        trackingNumber: info.trackingNumber,
        trackingUrl: info.trackingUrl,
        carrier: info.carrier,
        supplierStatus: info.status,
        supplierField: 'cjOrderStatus',
      })
      result.updated++
    } catch (err: any) {
      console.error(`[TrackingSync] CJ fallback failed for #${order.orderNumber}:`, err.message)
      result.errors++
    }
  }
}

async function syncAliExpressBatch(result: TrackingSyncResult) {
  const orders = await prisma.order.findMany({
    where: {
      aliexpressOrderId: { not: null },
      trackingNumber: null,
      status: { in: ['CONFIRMED', 'PROCESSING'] },
      paymentStatus: 'PAID',
    },
    select: { id: true, orderNumber: true, aliexpressOrderId: true, storeId: true },
  })

  if (orders.length === 0) return

  // Group by store for correct auth tokens
  const byStore = new Map<string, typeof orders>()
  for (const order of orders) {
    const key = order.storeId ?? '__default'
    if (!byStore.has(key)) byStore.set(key, [])
    byStore.get(key)!.push(order)
  }

  for (const [storeId, storeOrders] of byStore) {
    try {
      const ae = new AliExpressAdapter()
      if (storeId !== '__default') ae.withStore(storeId)

      // Fetch each order's status — AliExpress doesn't have a true batch endpoint
      // for DS orders, but we rate-limit and only process orders without tracking
      for (const order of storeOrders) {
        result.checked++
        try {
          const info = await ae.getOrderStatus(order.aliexpressOrderId!)
          if (!info.trackingNumber) continue

          await updateOrderWithTracking(order.id, {
            trackingNumber: info.trackingNumber,
            trackingUrl: info.trackingUrl,
            carrier: info.carrier,
            supplierStatus: info.status,
            supplierField: 'aliexpressOrderStatus',
          })
          result.updated++
        } catch (err: any) {
          console.error(`[TrackingSync] AliExpress failed for #${order.orderNumber}:`, err.message)
          result.errors++
        }
      }
    } catch (err: any) {
      console.error(`[TrackingSync] AliExpress batch error for store ${storeId}:`, err.message)
      result.errors++
    }
  }
}

async function updateOrderWithTracking(orderId: string, data: {
  trackingNumber: string
  trackingUrl?: string
  carrier?: string
  supplierStatus: string
  supplierField: 'cjOrderStatus' | 'aliexpressOrderStatus'
}) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl ?? null,
      [data.supplierField]: data.supplierStatus,
      status: 'SHIPPED',
      fulfillmentStatus: 'FULFILLED',
      shippedAt: new Date(),
      timeline: {
        create: {
          message: `Shipped via ${data.carrier ?? 'carrier'} — tracking: ${data.trackingNumber}`,
          createdBy: 'system',
        },
      },
    },
  })

  import('./email').then(({ sendShippingEmail, sendReviewInvitationEmail }) => {
    sendShippingEmail(orderId).catch(() => {})
    sendReviewInvitationEmail(orderId).catch(() => {})
  })
}
