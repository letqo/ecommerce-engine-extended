import { MarketAvailability } from './types'

export interface MarketDeviationWarning {
  type: 'delivery' | 'cost'
  message: string
}

// A market is flagged as an outlier when it's at least this many times slower/pricier than
// the best market checked — e.g. 2 means "18+ days is a warning when the fastest market is 9".
const RATIO_THRESHOLD = 2

// Flags products where delivery time or shipping cost swings wildly between target markets
// (e.g. 50 days to Germany but 9 to Spain) — a real signal that logistics coverage is uneven
// for this listing, worth knowing before adding it to the catalog.
export function computeMarketDeviation(detail: Record<string, MarketAvailability>): MarketDeviationWarning[] {
  const warnings: MarketDeviationWarning[] = []
  const available = Object.entries(detail).filter(([, v]) => v.available)
  if (available.length < 2) return warnings

  const deliveryEntries = available
    .map(([country, v]) => {
      const days = v.deliveryMinDays != null && v.deliveryMaxDays != null
        ? (v.deliveryMinDays + v.deliveryMaxDays) / 2
        : v.deliveryMaxDays ?? v.deliveryMinDays
      return days != null ? { country, days } : null
    })
    .filter((e): e is { country: string; days: number } => e != null)

  if (deliveryEntries.length >= 2) {
    const fastest = deliveryEntries.reduce((a, b) => (b.days < a.days ? b : a))
    const slowest = deliveryEntries.reduce((a, b) => (b.days > a.days ? b : a))
    if (fastest.days > 0 && slowest.days / fastest.days >= RATIO_THRESHOLD) {
      warnings.push({
        type: 'delivery',
        message: `Delivery time varies a lot by market: ~${Math.round(slowest.days)} days to ${slowest.country} vs ~${Math.round(fastest.days)} days to ${fastest.country}.`,
      })
    }
  }

  const costEntries = available
    .map(([country, v]) => (v.shippingCost != null ? { country, cost: v.shippingCost } : null))
    .filter((e): e is { country: string; cost: number } => e != null)

  if (costEntries.length >= 2) {
    const cheapest = costEntries.reduce((a, b) => (b.cost < a.cost ? b : a))
    const priciest = costEntries.reduce((a, b) => (b.cost > a.cost ? b : a))
    if (cheapest.cost > 0 && priciest.cost / cheapest.cost >= RATIO_THRESHOLD) {
      warnings.push({
        type: 'cost',
        message: `Shipping cost varies a lot by market: $${priciest.cost.toFixed(2)} to ${priciest.country} vs $${cheapest.cost.toFixed(2)} to ${cheapest.country}.`,
      })
    }
  }

  return warnings
}

// A max delivery estimate beyond this is worth flagging on its own, even when every target
// market agrees on it (i.e. no cross-market deviation) — e.g. a uniform 60-day estimate.
const SLOW_DELIVERY_THRESHOLD_DAYS = 21

// Combines the absolute-slowness check above with computeMarketDeviation's cross-market swing
// detection into one persistable note — same idea as unavailableMarkets, a plain-language
// snapshot worth keeping on the product instead of only surfacing during import.
export function buildDeliveryNote(
  deliveryMinDays: number | undefined,
  deliveryMaxDays: number | undefined,
  marketDetail?: Record<string, MarketAvailability>
): string | null {
  const notes: string[] = []

  if (deliveryMaxDays != null && deliveryMaxDays > SLOW_DELIVERY_THRESHOLD_DAYS) {
    notes.push(
      deliveryMinDays != null && deliveryMinDays !== deliveryMaxDays
        ? `Slow delivery: ${deliveryMinDays}-${deliveryMaxDays} days`
        : `Slow delivery: ~${deliveryMaxDays} days`
    )
  }

  if (marketDetail) {
    for (const w of computeMarketDeviation(marketDetail)) notes.push(w.message)
  }

  return notes.length > 0 ? notes.join(' | ') : null
}
