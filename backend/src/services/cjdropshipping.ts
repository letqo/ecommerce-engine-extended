import { prisma } from '../config/database'
import { CJAdapter } from '../suppliers/CJAdapter'

export async function fulfillOrderWithCJ(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { variant: true } },
    },
  })

  if (!order) throw new Error(`Order ${orderId} not found`)
  if (order.cjOrderId) return // already submitted

  const addr = order.shippingAddress as any

  // Only include items whose variants have a CJ variant ID
  const cjItems = order.items
    .filter((item) => item.variant.cjVariantId)
    .map((item) => ({
      variantSupplierId: item.variant.cjVariantId!,
      quantity: item.quantity,
    }))

  if (cjItems.length === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        timeline: {
          create: { message: 'No CJ variants found — manual fulfillment required', createdBy: 'system' },
        },
      },
    })
    return
  }

  const cj = new CJAdapter()
  const result = await cj.placeOrder({
    ourOrderId: order.orderNumber.toString(),
    items: cjItems,
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
  })

  await prisma.order.update({
    where: { id: orderId },
    data: {
      cjOrderId: result.supplierOrderId,
      cjOrderStatus: result.status,
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      timeline: {
        create: { message: `Order submitted to CJ Dropshipping (ID: ${result.supplierOrderId})`, createdBy: 'system' },
      },
    },
  })
}
