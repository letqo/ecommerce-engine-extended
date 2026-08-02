import { prisma } from '../config/database'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'

export async function fulfillOrderWithAliExpress(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { variant: { include: { product: true } } } },
    },
  })

  if (!order) throw new Error(`Order ${orderId} not found`)
  if (order.aliexpressOrderId) return // already submitted

  const addr = order.shippingAddress as any

  const aeItems = order.items
    .filter((item) => item.variant.product?.aliexpressProductId && (item.variant.aliexpressSkuId || item.variant.aliexpressSkuAttr))
    .map((item) => ({
      variantSupplierId: `${item.variant.product!.aliexpressProductId}:::${item.variant.aliexpressSkuAttr ?? ''}`,
      quantity: item.quantity,
    }))

  if (aeItems.length === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        timeline: {
          create: { message: 'No AliExpress variants found — manual fulfillment required', createdBy: 'system' },
        },
      },
    })
    return
  }

  const ae = new AliExpressAdapter()
  if (order.storeId) ae.withStore(order.storeId)

  const result = await ae.placeOrder({
    ourOrderId: order.orderNumber.toString(),
    shippingAddress: {
      firstName: addr.firstName ?? '',
      lastName: addr.lastName ?? '',
      address1: addr.address1 ?? '',
      address2: addr.address2,
      city: addr.city ?? '',
      province: addr.province,
      postalCode: addr.postalCode ?? '',
      countryCode: addr.country ?? 'US',
      phone: addr.phone,
    },
    items: aeItems,
  })

  // PARTIALLY_FULFILLED if the order also has CJ items that haven't been submitted yet
  const hasPendingCJ = order.items.some((item) => item.variant.cjVariantId) && !order.cjOrderId
  const fulfillmentStatus = hasPendingCJ ? 'PARTIALLY_FULFILLED' : 'FULFILLED'

  await prisma.order.update({
    where: { id: orderId },
    data: {
      aliexpressOrderId: result.supplierOrderId,
      aliexpressOrderStatus: result.status,
      fulfillmentStatus,
      timeline: {
        create: { message: `Order submitted to AliExpress (ID: ${result.supplierOrderId})`, createdBy: 'system' },
      },
    },
  })
}
