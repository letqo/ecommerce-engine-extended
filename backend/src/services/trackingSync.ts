import { prisma } from '../config/database'
import { CJAdapter } from '../suppliers/CJAdapter'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'
import { getConfigurableAdapter } from '../suppliers/registry'
import { CONFIGURABLE_SUPPLIER_KEYS, ConfigurableSupplierKey, SupplierSettings } from '../suppliers/configurableTypes'
import { recomputeOrderFulfillment } from './supplierOrderFulfillment'

interface TrackingSyncResult {
  checked: number
  updated: number
  errors: number
}

export async function runTrackingSync(): Promise<TrackingSyncResult> {
  const result: TrackingSyncResult = { checked: 0, updated: 0, errors: 0 }

  // CJ tracking is handled by webhooks — only poll as fallback for parcels stuck > 24h
  await syncCJTrackingFallback(result)

  // AliExpress — batch query all pending parcels at once
  await syncAliExpressBatch(result)

  // Printful/Gelato/BigBuy/WooBridge have no webhook route mounted yet (Printful/WooBridge
  // could sign or otherwise authenticate one, Gelato/BigBuy don't support webhooks at all per
  // configurableRegistry.ts) — polling is the only way any of them get tracking back today.
  // Every one of them implements getOrderStatus, so this is a single generic pass.
  for (const key of CONFIGURABLE_SUPPLIER_KEYS) {
    await syncConfigurableSupplier(key, result)
  }

  if (result.checked > 0) {
    console.log(`[TrackingSync] Done — checked: ${result.checked}, updated: ${result.updated}, errors: ${result.errors}`)
  }

  return result
}

async function syncCJTrackingFallback(result: TrackingSyncResult) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const supplierOrders = await prisma.supplierOrder.findMany({
    where: {
      supplierKey: 'CJ',
      status: 'SUBMITTED',
      trackingNumber: null,
      updatedAt: { lt: oneDayAgo },
    },
    select: { id: true, externalOrderId: true, order: { select: { orderNumber: true } } },
    take: 20,
  })

  for (const so of supplierOrders) {
    result.checked++
    try {
      const cj = new CJAdapter()
      const info = await cj.getOrderStatus(so.externalOrderId!)
      if (!info.trackingNumber) continue

      await updateSupplierOrderWithTracking(so.id, {
        trackingNumber: info.trackingNumber,
        trackingUrl: info.trackingUrl,
        carrier: info.carrier,
        externalStatus: info.status,
      })
      result.updated++
    } catch (err: any) {
      console.error(`[TrackingSync] CJ fallback failed for #${so.order.orderNumber}:`, err.message)
      result.errors++
    }
  }
}

async function syncAliExpressBatch(result: TrackingSyncResult) {
  const supplierOrders = await prisma.supplierOrder.findMany({
    where: {
      supplierKey: 'ALIEXPRESS',
      status: 'SUBMITTED',
      trackingNumber: null,
    },
    select: { id: true, externalOrderId: true, storeId: true, order: { select: { orderNumber: true } } },
  })

  if (supplierOrders.length === 0) return

  // Group by store for correct auth tokens
  const byStore = new Map<string, typeof supplierOrders>()
  for (const so of supplierOrders) {
    const key = so.storeId ?? '__default'
    if (!byStore.has(key)) byStore.set(key, [])
    byStore.get(key)!.push(so)
  }

  for (const [storeId, storeSupplierOrders] of byStore) {
    try {
      const ae = new AliExpressAdapter()
      if (storeId !== '__default') ae.withStore(storeId)

      // Fetch each parcel's status — AliExpress doesn't have a true batch endpoint
      // for DS orders, but we rate-limit and only process parcels without tracking
      for (const so of storeSupplierOrders) {
        result.checked++
        try {
          const info = await ae.getOrderStatus(so.externalOrderId!)
          if (!info.trackingNumber) continue

          await updateSupplierOrderWithTracking(so.id, {
            trackingNumber: info.trackingNumber,
            trackingUrl: info.trackingUrl,
            carrier: info.carrier,
            externalStatus: info.status,
          })
          result.updated++
        } catch (err: any) {
          console.error(`[TrackingSync] AliExpress failed for #${so.order.orderNumber}:`, err.message)
          result.errors++
        }
      }
    } catch (err: any) {
      console.error(`[TrackingSync] AliExpress batch error for store ${storeId}:`, err.message)
      result.errors++
    }
  }
}

async function syncConfigurableSupplier(key: ConfigurableSupplierKey, result: TrackingSyncResult) {
  const supplierOrders = await prisma.supplierOrder.findMany({
    where: { supplierKey: key, status: 'SUBMITTED', trackingNumber: null, externalOrderId: { not: null } },
    select: { id: true, externalOrderId: true, storeId: true, order: { select: { orderNumber: true } } },
  })
  if (supplierOrders.length === 0) return

  // Each store has its own credentials — group so we build one adapter per store, not per parcel.
  const byStore = new Map<string, typeof supplierOrders>()
  for (const so of supplierOrders) {
    if (!so.storeId) continue // a configurable-supplier parcel always has a storeId; skip if data is inconsistent
    if (!byStore.has(so.storeId)) byStore.set(so.storeId, [])
    byStore.get(so.storeId)!.push(so)
  }

  for (const [storeId, storeSupplierOrders] of byStore) {
    try {
      const storeSupplier = await prisma.storeSupplier.findUnique({
        where: { storeId_supplierKey: { storeId, supplierKey: key } },
      })
      if (!storeSupplier?.enabled) continue // disabled since submission — nothing to poll with

      const adapter = getConfigurableAdapter(key, (storeSupplier.settings ?? {}) as SupplierSettings)

      for (const so of storeSupplierOrders) {
        result.checked++
        try {
          const info = await adapter.getOrderStatus(so.externalOrderId!)
          if (!info.trackingNumber) continue

          await updateSupplierOrderWithTracking(so.id, {
            trackingNumber: info.trackingNumber,
            trackingUrl: info.trackingUrl,
            carrier: info.carrier,
            externalStatus: info.status,
          })
          result.updated++
        } catch (err: any) {
          console.error(`[TrackingSync] ${key} failed for #${so.order.orderNumber}:`, err.message)
          result.errors++
        }
      }
    } catch (err: any) {
      console.error(`[TrackingSync] ${key} batch error for store ${storeId}:`, err.message)
      result.errors++
    }
  }
}

async function updateSupplierOrderWithTracking(supplierOrderId: string, data: {
  trackingNumber: string
  trackingUrl?: string
  carrier?: string
  externalStatus: string
}) {
  const so = await prisma.supplierOrder.update({
    where: { id: supplierOrderId },
    data: {
      status: 'SHIPPED',
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl ?? null,
      trackingCarrier: data.carrier,
      externalStatus: data.externalStatus,
      shippedAt: new Date(),
    },
  })

  await prisma.orderTimeline.create({
    data: {
      orderId: so.orderId,
      message: `Parcel (${so.supplierKey}) shipped via ${data.carrier ?? 'carrier'} — tracking: ${data.trackingNumber}`,
      createdBy: 'system',
    },
  })

  await recomputeOrderFulfillment(so.orderId)

  const items = await prisma.orderItem.findMany({ where: { supplierOrderId: so.id }, select: { id: true } })
  const itemIds = items.map((i) => i.id)
  import('./email').then(({ sendShippingEmail, sendReviewInvitationEmail }) => {
    sendShippingEmail(so.id).catch(() => {})
    sendReviewInvitationEmail(so.orderId, itemIds).catch(() => {})
  })
}
