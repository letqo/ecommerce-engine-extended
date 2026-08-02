import { prisma } from '../config/database'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'
import { CJAdapter } from '../suppliers/CJAdapter'
import { MarketAvailability } from '../suppliers/types'

// Shared by checkShippingAvailability and estimateDeliveryForCountry — checks each
// supplier-linked cart item against the customer's real shipping country, never against the
// store's shipToCountry/targetMarkets settings. Fails open: a rejected or errored adapter call
// is treated as available (no delivery estimate), so a transient CJ/AliExpress API hiccup never
// blocks a sale or a delivery estimate that would otherwise be fine.
async function getMarketAvailabilityForItems(
  items: { variantId: string; quantity: number }[],
  countryCode: string,
  storeId?: string
): Promise<{ variantId: string; title: string; result: MarketAvailability }[]> {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) }, product: { storeId } },
    include: {
      product: { select: { id: true, title: true, cjProductId: true, aliexpressProductId: true, storeId: true } },
    },
  })

  const results: { variantId: string; title: string; result: MarketAvailability }[] = []
  const checks: Promise<void>[] = []

  for (const variant of variants) {
    const p = variant.product
    if (p.cjProductId && variant.cjVariantId) {
      checks.push(
        (async () => {
          try {
            const cj = new CJAdapter()
            if (p.storeId) cj.withStore(p.storeId)
            const result = await cj.checkMarketAvailability(p.cjProductId!, countryCode, variant.cjVariantId!)
            results.push({ variantId: variant.id, title: p.title, result })
          } catch {
            results.push({ variantId: variant.id, title: p.title, result: { available: true } })
          }
        })()
      )
    } else if (p.aliexpressProductId && variant.aliexpressSkuId) {
      checks.push(
        (async () => {
          try {
            const ae = new AliExpressAdapter()
            if (p.storeId) ae.withStore(p.storeId)
            const result = await ae.checkMarketAvailability(p.aliexpressProductId!, countryCode, variant.aliexpressSkuId!)
            results.push({ variantId: variant.id, title: p.title, result })
          } catch {
            results.push({ variantId: variant.id, title: p.title, result: { available: true } })
          }
        })()
      )
    }
  }

  await Promise.allSettled(checks)
  return results
}

export async function checkShippingAvailability(
  items: { variantId: string; quantity: number }[],
  countryCode: string,
  storeId?: string
): Promise<{ variantId: string; title: string }[]> {
  const results = await getMarketAvailabilityForItems(items, countryCode, storeId)
  return results
    .filter((r) => r.result.available === false)
    .map((r) => ({ variantId: r.variantId, title: r.title }))
}

// Worst-case delivery window for the whole cart to a specific country — earliest possible
// start across items, latest possible finish, since a multi-item order isn't complete until
// every item has arrived. Items with no usable estimate (non-supplier products, or a check
// that couldn't get a real answer) are left out of the range rather than counted as 0 days.
export async function estimateDeliveryForCountry(
  items: { variantId: string; quantity: number }[],
  countryCode: string,
  storeId?: string
): Promise<{ deliveryMinDays?: number; deliveryMaxDays?: number }> {
  const results = await getMarketAvailabilityForItems(items, countryCode, storeId)
  let deliveryMinDays: number | undefined
  let deliveryMaxDays: number | undefined
  for (const { result } of results) {
    if (result.deliveryMinDays != null) {
      deliveryMinDays = deliveryMinDays == null ? result.deliveryMinDays : Math.min(deliveryMinDays, result.deliveryMinDays)
    }
    if (result.deliveryMaxDays != null) {
      deliveryMaxDays = deliveryMaxDays == null ? result.deliveryMaxDays : Math.max(deliveryMaxDays, result.deliveryMaxDays)
    }
  }
  return { deliveryMinDays, deliveryMaxDays }
}
