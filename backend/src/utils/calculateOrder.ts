import { prisma } from '../config/database'
import { createError } from '../middleware/errorHandler'
import { checkShippingAvailability } from '../services/shippingAvailability'

export const calculateOrder = async (
  cartItems: Array<{ variantId: string; quantity: number }>,
  couponCode?: string,
  shippingRateId?: string,
  storeId?: string,
  shippingCountry?: string
) => {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: cartItems.map((i) => i.variantId) }, product: { storeId } },
    include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
  })

  if (shippingCountry) {
    const unavailable = await checkShippingAvailability(cartItems, shippingCountry, storeId)
    if (unavailable.length > 0) {
      const titles = [...new Set(unavailable.map((u) => u.title))].map((t) => `"${t}"`).join(', ')
      throw createError(`${titles} cannot be shipped to ${shippingCountry} — please remove ${unavailable.length > 1 ? 'these items' : 'it'} from your cart.`, 400, 'SHIPPING_UNAVAILABLE')
    }
  }

  const items = cartItems.map((ci) => {
    const v = variants.find((x) => x.id === ci.variantId)
    if (!v) throw new Error(`Variant ${ci.variantId} not found`)
    if (v.trackInventory && !v.allowBackorder && v.inventoryQty < ci.quantity) {
      throw createError(`"${v.product.title}" only has ${v.inventoryQty} left in stock`, 400, 'OUT_OF_STOCK')
    }
    return {
      variantId: v.id,
      title: v.product.title,
      variantTitle: v.title,
      sku: v.sku,
      price: v.price,
      quantity: ci.quantity,
      imageUrl: v.imageUrl || v.product.images[0]?.url || null,
    }
  })

  const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100

  let discountAmount = 0
  let discountId: string | undefined
  let freeShipping = false

  if (couponCode) {
    const discount = await prisma.discount.findFirst({
      where: {
        code: { equals: couponCode, mode: 'insensitive' },
        storeId,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
      },
    })
    if (discount) {
      const meetsMin = !discount.minOrderAmount || subtotal >= discount.minOrderAmount
      const hasUses = !discount.maxUses || discount.usedCount < discount.maxUses
      if (meetsMin && hasUses) {
        discountId = discount.id
        if (discount.type === 'PERCENTAGE') {
          discountAmount = Math.round(subtotal * (discount.value / 100) * 100) / 100
        } else if (discount.type === 'FIXED_AMOUNT') {
          discountAmount = Math.min(discount.value, subtotal)
        } else if (discount.type === 'FREE_SHIPPING') {
          freeShipping = true
        }
      }
    }
  }

  let shippingAmount = 4.99
  if (shippingRateId) {
    const rate = await prisma.shippingRate.findFirst({ where: { id: shippingRateId, zone: { storeId } } })
    if (rate) shippingAmount = rate.isFree ? 0 : rate.price
  }
  if (freeShipping) shippingAmount = 0

  const taxAmount = 0
  const total = Math.max(0, Math.round((subtotal - discountAmount + shippingAmount + taxAmount) * 100) / 100)

  return { items, subtotal, discountAmount, shippingAmount, taxAmount, total, discountId }
}
