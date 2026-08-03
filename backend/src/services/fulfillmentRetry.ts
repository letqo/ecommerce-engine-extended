import { prisma } from '../config/database'
import { submitSupplierOrder, MAX_AUTO_RETRY_ATTEMPTS } from './supplierOrderFulfillment'

interface RetryResult {
  checked: number
  succeeded: number
  stillFailing: number
}

// Picks up API-backed parcels that failed submission and are due for their next backoff
// attempt (1m/5m/30m/2h/12h, set by submitSupplierOrder). MANUAL parcels never appear here —
// there's no API to retry against. Parcels that exhausted all attempts have nextRetryAt
// cleared, so they naturally drop out of this query and wait for a human via the Fulfillment
// Queue.
export async function runFulfillmentRetry(): Promise<RetryResult> {
  const result: RetryResult = { checked: 0, succeeded: 0, stillFailing: 0 }

  const due = await prisma.supplierOrder.findMany({
    where: {
      status: 'ERROR',
      // Every supplier with an ordering API. MANUAL is the only key deliberately excluded.
      supplierKey: { in: ['CJ', 'ALIEXPRESS', 'PRINTFUL', 'GELATO', 'BIGBUY', 'WOO_BRIDGE'] },
      attempts: { lt: MAX_AUTO_RETRY_ATTEMPTS },
      nextRetryAt: { lte: new Date() },
    },
    select: { id: true, order: { select: { orderNumber: true } } },
    take: 25,
  })

  for (const so of due) {
    result.checked++
    try {
      await submitSupplierOrder(so.id)
      result.succeeded++
    } catch (err: any) {
      result.stillFailing++
      console.error(`[FulfillmentRetry] Parcel for order #${so.order.orderNumber} still failing:`, err.message)
    }
  }

  if (result.checked > 0) {
    console.log(`[FulfillmentRetry] Done — checked: ${result.checked}, succeeded: ${result.succeeded}, still failing: ${result.stillFailing}`)
  }

  return result
}
