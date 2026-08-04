import { prisma } from '../../config/database'
import type { SupplierKey, SupplierOrder } from '@prisma/client'

// Finds the SupplierOrder a webhook delivery is about, scoped to the store the callback URL
// names (webhook routes never go through resolveStore — there's no request origin to key off).
// Tries the supplier's own order id first (set on our side right after placeOrder succeeds);
// falls back to the order number we sent as ourOrderId, for the rare case a webhook arrives
// before that write commits.
export async function findSupplierOrderForWebhook(
  storeId: string,
  supplierKey: SupplierKey,
  externalOrderId?: string,
  ourOrderRef?: string
): Promise<SupplierOrder | null> {
  if (externalOrderId) {
    const byExternal = await prisma.supplierOrder.findFirst({ where: { storeId, supplierKey, externalOrderId } })
    if (byExternal) return byExternal
  }
  if (ourOrderRef) {
    const orderNumber = Number(ourOrderRef)
    if (Number.isFinite(orderNumber)) {
      return prisma.supplierOrder.findFirst({ where: { storeId, supplierKey, order: { orderNumber } } })
    }
  }
  return null
}
