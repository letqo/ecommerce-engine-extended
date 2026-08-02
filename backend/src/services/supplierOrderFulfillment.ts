import crypto from 'crypto'
import { prisma } from '../config/database'
import { CJAdapter } from '../suppliers/CJAdapter'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'
import { checkBeforeFulfillment } from './supplierSync'
import type { SupplierKey, SupplierOrder } from '@prisma/client'

// 1m / 5m / 30m / 2h / 12h — after the 5th failed attempt we stop auto-retrying and
// email the store owner instead; they can still retry by hand from the Fulfillment Queue.
const RETRY_BACKOFF_MS = [1, 5, 30, 120, 720].map((min) => min * 60 * 1000)
export const MAX_AUTO_RETRY_ATTEMPTS = RETRY_BACKOFF_MS.length

type VariantForClassification = {
  cjVariantId?: string | null
  aliexpressSkuId?: string | null
  aliexpressSkuAttr?: string | null
  product?: { aliexpressProductId?: string | null; vendor?: string | null } | null
}

// The one rule that decides which parcel an item belongs to — used both when actually
// splitting a paid order and when previewing the split for a not-yet-purchased cart
// (checkout's "may arrive in multiple parcels" note).
function classifySupplier(variant: VariantForClassification | null | undefined): { supplierKey: SupplierKey; supplierName?: string; groupKey: string } {
  if (variant?.cjVariantId) return { supplierKey: 'CJ', groupKey: 'CJ' }
  if (variant?.product?.aliexpressProductId && (variant?.aliexpressSkuId || variant?.aliexpressSkuAttr)) {
    return { supplierKey: 'ALIEXPRESS', groupKey: 'ALIEXPRESS' }
  }
  const supplierName = variant?.product?.vendor || 'Manual fulfillment'
  return { supplierKey: 'MANUAL', supplierName, groupKey: `MANUAL:${supplierName}` }
}

// Read-only preview for the checkout page — how many parcels would this cart split into,
// without creating anything. Same classification rule as the real split below.
export async function previewParcelCount(items: { variantId: string }[]): Promise<number> {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: { select: { aliexpressProductId: true, vendor: true } } },
  })
  const groupKeys = new Set(variants.map((v) => classifySupplier(v).groupKey))
  return groupKeys.size
}

// Splits a paid order's items into one SupplierOrder per supplier — CJ, AliExpress, or a
// generic MANUAL parcel (named after the product's `vendor`) for anything without an
// ordering API. Idempotent: an order that's already been split is returned as-is, so this
// is safe to call from a webhook that might redeliver.
export async function splitOrderIntoSupplierOrders(orderId: string): Promise<SupplierOrder[]> {
  const existing = await prisma.supplierOrder.findMany({ where: { orderId } })
  if (existing.length > 0) return existing

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  })
  if (!order) throw new Error(`Order ${orderId} not found`)

  const groups = new Map<string, { supplierKey: SupplierKey; supplierName?: string; itemIds: string[] }>()
  for (const item of order.items) {
    const { supplierKey, supplierName, groupKey } = classifySupplier(item.variant)
    if (!groups.has(groupKey)) groups.set(groupKey, { supplierKey, supplierName, itemIds: [] })
    groups.get(groupKey)!.itemIds.push(item.id)
  }

  const created: SupplierOrder[] = []
  for (const group of groups.values()) {
    const supplierOrder = await prisma.supplierOrder.create({
      data: { orderId: order.id, storeId: order.storeId, supplierKey: group.supplierKey, supplierName: group.supplierName },
    })
    await prisma.orderItem.updateMany({ where: { id: { in: group.itemIds } }, data: { supplierOrderId: supplierOrder.id } })
    created.push(supplierOrder)
  }

  const summary = created.map((so) => (so.supplierKey === 'MANUAL' ? `Manual (${so.supplierName})` : so.supplierKey)).join(', ')
  await prisma.orderTimeline.create({
    data: { orderId: order.id, message: `Order split into ${created.length} parcel${created.length === 1 ? '' : 's'}: ${summary}`, createdBy: 'system' },
  })

  return created
}

// Submits a CJ/ALIEXPRESS SupplierOrder to that supplier's ordering API. Does nothing for
// MANUAL parcels (there's no API to submit to — they stay AWAITING_MANUAL) and is
// idempotent for parcels already SUBMITTED/SHIPPED.
export async function submitSupplierOrder(supplierOrderId: string, opts: { force?: boolean } = {}): Promise<SupplierOrder> {
  const so = await prisma.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    include: { items: { include: { variant: { include: { product: true } } } }, order: true },
  })
  if (!so) throw new Error('SupplierOrder not found')
  if (so.supplierKey === 'MANUAL' || so.status === 'SUBMITTED' || so.status === 'SHIPPED') return so

  const preflight = await checkBeforeFulfillment(so.orderId)
  if (!preflight.ok && !opts.force) {
    const err: any = new Error('Supplier sync warnings')
    err.code = 'SYNC_WARNING'
    err.warnings = preflight.warnings
    throw err
  }

  const addr = so.order.shippingAddress as any
  const shippingAddress = {
    firstName: addr.firstName ?? '', lastName: addr.lastName ?? '',
    address1: addr.address1 ?? '', address2: addr.address2,
    city: addr.city ?? '', province: addr.province,
    postalCode: addr.postalCode ?? '', countryCode: addr.country ?? 'US',
    phone: addr.phone,
  }

  try {
    let result: { supplierOrderId: string; status: string }
    if (so.supplierKey === 'CJ') {
      const cjItems = so.items.filter((item) => item.variant?.cjVariantId)
      if (cjItems.length === 0) throw new Error('No CJ variants on this parcel')
      const cj = new CJAdapter()
      result = await cj.placeOrder({
        ourOrderId: String(so.order.orderNumber),
        shippingAddress,
        items: cjItems.map((item) => ({ variantSupplierId: item.variant!.cjVariantId!, quantity: item.quantity })),
      })
    } else {
      const aeItems = so.items.filter((item) => item.variant?.product?.aliexpressProductId)
      if (aeItems.length === 0) throw new Error('No AliExpress variants on this parcel')
      const ae = new AliExpressAdapter()
      if (so.storeId) ae.withStore(so.storeId)
      result = await ae.placeOrder({
        ourOrderId: String(so.order.orderNumber),
        shippingAddress,
        items: aeItems.map((item) => ({
          variantSupplierId: `${item.variant!.product!.aliexpressProductId}:::${item.variant!.aliexpressSkuAttr ?? ''}`,
          quantity: item.quantity,
        })),
      })
    }

    const updated = await prisma.supplierOrder.update({
      where: { id: so.id },
      data: {
        status: 'SUBMITTED', externalOrderId: result.supplierOrderId, externalStatus: result.status, submittedAt: new Date(),
        attempts: 0, nextRetryAt: null, lastError: null,
      },
    })
    await prisma.orderTimeline.create({
      data: { orderId: so.orderId, message: `Submitted to ${so.supplierKey === 'CJ' ? 'CJ Dropshipping' : 'AliExpress'} — order ID: ${result.supplierOrderId}`, createdBy: 'system' },
    })
    await recomputeOrderFulfillment(so.orderId)
    return updated
  } catch (err: any) {
    const attempts = so.attempts + 1
    const exhausted = attempts >= MAX_AUTO_RETRY_ATTEMPTS
    const nextRetryAt = exhausted ? null : new Date(Date.now() + RETRY_BACKOFF_MS[attempts - 1])

    await prisma.supplierOrder.update({
      where: { id: so.id },
      data: { status: 'ERROR', lastError: err.message, attempts, nextRetryAt },
    })
    await prisma.orderTimeline.create({
      data: {
        orderId: so.orderId,
        message: exhausted
          ? `Submission to ${so.supplierKey === 'CJ' ? 'CJ' : 'AliExpress'} failed (attempt ${attempts}/${MAX_AUTO_RETRY_ATTEMPTS}): ${err.message} — giving up automatic retries, needs manual attention.`
          : `Submission to ${so.supplierKey === 'CJ' ? 'CJ' : 'AliExpress'} failed (attempt ${attempts}/${MAX_AUTO_RETRY_ATTEMPTS}): ${err.message} — retrying automatically.`,
        createdBy: 'system',
      },
    })

    if (exhausted && !so.failureNotifiedAt) {
      await prisma.supplierOrder.update({ where: { id: so.id }, data: { failureNotifiedAt: new Date() } })
      import('./email').then(({ sendFulfillmentFailureAlertEmail }) =>
        sendFulfillmentFailureAlertEmail(so.id).catch((e: Error) => console.error('Fulfillment failure alert email error:', e.message))
      )
    }

    throw err
  }
}

// The manual-fulfillment path — enter tracking for one parcel by hand (Good Display today,
// any CJ/AliExpress parcel that errored and got moved to manual, or a future manual supplier).
export async function fulfillSupplierOrderManually(
  supplierOrderId: string,
  data: { trackingNumber: string; trackingUrl?: string; carrier?: string },
  createdBy: string
): Promise<SupplierOrder> {
  const so = await prisma.supplierOrder.findUnique({ where: { id: supplierOrderId }, include: { items: true } })
  if (!so) throw new Error('SupplierOrder not found')

  const itemsNeedingToken = so.items.filter((item) => !item.reviewToken)
  await Promise.all(
    itemsNeedingToken.map((item) =>
      prisma.orderItem.update({ where: { id: item.id }, data: { reviewToken: crypto.randomBytes(32).toString('hex') } })
    )
  )

  const updated = await prisma.supplierOrder.update({
    where: { id: so.id },
    data: {
      status: 'SHIPPED',
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl,
      trackingCarrier: data.carrier,
      shippedAt: so.shippedAt ?? new Date(),
    },
  })

  const label = so.supplierKey === 'MANUAL' ? `Parcel (${so.supplierName ?? 'Manual'})` : `Parcel (${so.supplierKey})`
  await prisma.orderTimeline.create({
    data: { orderId: so.orderId, message: `${label} — tracking added: ${data.trackingNumber}`, createdBy },
  })

  await recomputeOrderFulfillment(so.orderId)

  const itemIds = so.items.map((item) => item.id)
  import('./email').then(({ sendShippingEmail, sendReviewInvitationEmail }) => {
    sendShippingEmail(so.id).catch((e: Error) => console.error('Shipping email error:', e.message))
    sendReviewInvitationEmail(so.orderId, itemIds).catch((e: Error) => console.error('Review invitation email error:', e.message))
  })

  return updated
}

// Derives the parent Order's aggregate status from its SupplierOrders — call after any
// SupplierOrder transition. CANCELLED parcels don't count against "all shipped".
export async function recomputeOrderFulfillment(orderId: string): Promise<void> {
  const supplierOrders = await prisma.supplierOrder.findMany({ where: { orderId } })
  if (supplierOrders.length === 0) return

  const relevant = supplierOrders.filter((so) => so.status !== 'CANCELLED')
  const shipped = relevant.filter((so) => so.status === 'SHIPPED')

  let fulfillmentStatus: 'UNFULFILLED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' = 'UNFULFILLED'
  if (relevant.length > 0 && shipped.length === relevant.length) fulfillmentStatus = 'FULFILLED'
  else if (shipped.length > 0) fulfillmentStatus = 'PARTIALLY_FULFILLED'

  const data: any = { fulfillmentStatus }
  if (fulfillmentStatus === 'FULFILLED') data.status = 'SHIPPED'
  else if (fulfillmentStatus === 'PARTIALLY_FULFILLED') data.status = 'PROCESSING'

  if (shipped.length > 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { shippedAt: true } })
    if (order && !order.shippedAt) data.shippedAt = new Date()
  }

  await prisma.order.update({ where: { id: orderId }, data })
}
