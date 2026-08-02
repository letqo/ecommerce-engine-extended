import { prisma } from '../config/database'
import { getAdapter } from '../suppliers/registry'
import { AliExpressAdapter } from '../suppliers/AliExpressAdapter'
import { CJAdapter } from '../suppliers/CJAdapter'
import { SupplierProduct } from '../suppliers/types'

interface SyncResult {
  synced: number
  alerts: number
  errors: number
}

export async function runSupplierSync(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, alerts: 0, errors: 0 }

  const products = await prisma.product.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      OR: [
        { cjProductId: { not: null } },
        { aliexpressProductId: { not: null } },
      ],
    },
    include: {
      variants: true,
      store: { select: { id: true, contactEmail: true, name: true, primaryColor: true } },
    },
  })

  for (const product of products) {
    try {
      const supplierData = await fetchSupplierData(product)

      if (!supplierData) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            status: 'ARCHIVED',
            syncAlert: 'Product removed by supplier — archived automatically',
            lastSyncedAt: new Date(),
          },
        })
        result.alerts++
        result.synced++
        continue
      }

      const alerts: string[] = []

      // Check each variant for price/stock changes
      for (const variant of product.variants) {
        const supplierVariant = findMatchingVariant(variant, supplierData, product)
        if (!supplierVariant) {
          alerts.push(`Variant "${variant.title}" no longer available from supplier`)
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { inventoryQty: 0 },
          })
          continue
        }

        // Landed cost = item cost + the supplier's shipping fee to fulfill it — not just the
        // item's list price. A cheap item with expensive shipping can still lose money even
        // when its item cost alone looks fine against your selling price.
        const landedCost = Math.round((supplierVariant.costPrice + (supplierData.shippingCost ?? 0)) * 100) / 100

        // Price check: if supplier's true landed cost went up above our selling price
        if (landedCost > variant.price) {
          alerts.push(
            `"${variant.title}": supplier landed cost $${landedCost.toFixed(2)} (incl. shipping) exceeds your price $${variant.price.toFixed(2)}`
          )
        }

        // Update cost and inventory from supplier
        const updateData: any = {}

        if (variant.costPerItem !== landedCost) {
          updateData.costPerItem = landedCost
        }

        if (supplierVariant.stock != null && supplierVariant.stock !== variant.inventoryQty) {
          updateData.inventoryQty = supplierVariant.stock
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: updateData,
          })
        }
      }

      const syncAlert = alerts.length > 0 ? alerts.join(' | ') : null
      if (alerts.length > 0) result.alerts++

      const deliveryUpdate: Record<string, any> = {}
      if (supplierData.deliveryMinDays != null) deliveryUpdate.deliveryMinDays = supplierData.deliveryMinDays
      if (supplierData.deliveryMaxDays != null) deliveryUpdate.deliveryMaxDays = supplierData.deliveryMaxDays

      await prisma.product.update({
        where: { id: product.id },
        data: {
          syncAlert,
          lastSyncedAt: new Date(),
          ...deliveryUpdate,
        },
      })

      result.synced++
    } catch (err: any) {
      console.error(`[SupplierSync] Failed to sync product ${product.id} (${product.title}):`, err.message)
      result.errors++
    }
  }

  // Send admin email if there are alerts
  if (result.alerts > 0) {
    await sendSyncAlertEmail(result).catch((e: Error) =>
      console.error('[SupplierSync] Failed to send alert email:', e.message)
    )
  }

  console.log(`[SupplierSync] Done — synced: ${result.synced}, alerts: ${result.alerts}, errors: ${result.errors}`)
  return result
}

async function fetchSupplierData(
  product: { cjProductId: string | null; aliexpressProductId: string | null; store: { id: string } | null }
): Promise<SupplierProduct | null> {
  try {
    if (product.cjProductId) {
      const cj = new CJAdapter()
      if (product.store?.id) cj.withStore(product.store.id)
      return await cj.getProduct(product.cjProductId)
    }
    if (product.aliexpressProductId) {
      const ae = new AliExpressAdapter()
      if (product.store?.id) ae.withStore(product.store.id)
      return await ae.getProduct(product.aliexpressProductId)
    }
  } catch (err: any) {
    const msg = (err.message ?? '').toLowerCase()
    if (msg.includes('not found') || msg.includes('not exist') || msg.includes('offline')
      || msg.includes('product removed') || msg.includes('off shelf') || msg.includes('invalid product')) {
      return null
    }
    throw err
  }
  return null
}

function findMatchingVariant(
  variant: { cjVariantId: string | null; aliexpressSkuId: string | null },
  supplierData: SupplierProduct,
  product: { cjProductId: string | null; aliexpressProductId: string | null }
) {
  if (product.cjProductId && variant.cjVariantId) {
    return supplierData.variants.find((v) => v.supplierId === variant.cjVariantId)
  }
  if (product.aliexpressProductId && variant.aliexpressSkuId) {
    return supplierData.variants.find((v) => v.supplierId === variant.aliexpressSkuId)
  }
  // Fallback: single-variant products
  if (supplierData.variants.length === 1) {
    return supplierData.variants[0]
  }
  return null
}

// Pre-fulfillment check — call before placing supplier order
export async function checkBeforeFulfillment(orderId: string): Promise<{ ok: boolean; warnings: string[] }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          variant: {
            include: { product: { select: { id: true, cjProductId: true, aliexpressProductId: true, storeId: true } } },
          },
        },
      },
    },
  })

  if (!order) return { ok: false, warnings: ['Order not found'] }

  const warnings: string[] = []

  for (const item of order.items) {
    const product = item.variant?.product
    if (!product || (!product.cjProductId && !product.aliexpressProductId)) continue

    try {
      const supplierData = await fetchSupplierData({
        cjProductId: product.cjProductId,
        aliexpressProductId: product.aliexpressProductId,
        store: product.storeId ? { id: product.storeId } : null,
      })

      if (!supplierData) {
        warnings.push(`"${item.title}" is no longer available from the supplier`)
        continue
      }

      const supplierVariant = findMatchingVariant(
        { cjVariantId: item.variant!.cjVariantId, aliexpressSkuId: item.variant!.aliexpressSkuId },
        supplierData,
        product
      )

      if (!supplierVariant) {
        warnings.push(`Variant "${item.variantTitle}" of "${item.title}" is no longer available`)
        continue
      }

      const landedCost = Math.round((supplierVariant.costPrice + (supplierData.shippingCost ?? 0)) * 100) / 100
      if (landedCost > item.price) {
        warnings.push(
          `"${item.title}" (${item.variantTitle}): supplier landed cost now $${landedCost.toFixed(2)} (incl. shipping), you're selling at $${item.price.toFixed(2)}`
        )
      }

      if (supplierVariant.stock != null && supplierVariant.stock < item.quantity) {
        warnings.push(
          `"${item.title}" (${item.variantTitle}): only ${supplierVariant.stock} in stock, order needs ${item.quantity}`
        )
      }
    } catch (err: any) {
      warnings.push(`Could not verify "${item.title}" with supplier: ${err.message}`)
    }
  }

  return { ok: warnings.length === 0, warnings }
}

async function sendSyncAlertEmail(result: SyncResult) {
  const { Resend } = await import('resend')
  const { env } = await import('../config/env')

  if (!env.RESEND_API_KEY) return

  // Alerts span every store synced in this run — group by store so each store's
  // owner only sees their own products, sent from that store's own identity.
  const alertProducts = await prisma.product.findMany({
    where: { syncAlert: { not: null } },
    select: {
      title: true,
      syncAlert: true,
      store: { select: { id: true, contactEmail: true, name: true, primaryColor: true, emailFromName: true, emailFromAddress: true } },
    },
  })

  type AlertStore = NonNullable<(typeof alertProducts)[number]['store']> & { contactEmail: string }
  const byStore = new Map<string, { store: AlertStore; products: typeof alertProducts }>()
  for (const p of alertProducts) {
    if (!p.store?.contactEmail) continue
    const store = p.store as AlertStore
    const entry = byStore.get(store.id) ?? { store, products: [] }
    entry.products.push(p)
    byStore.set(store.id, entry)
  }

  const resend = new Resend(env.RESEND_API_KEY)

  for (const { store, products } of byStore.values()) {
    const rows = products
      .slice(0, 20)
      .map((p) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:600;">${p.title}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626;">${p.syncAlert}</td></tr>`)
      .join('')

    const fromName = store.emailFromName ?? env.EMAIL_FROM_NAME
    const fromAddress = store.emailFromAddress ?? env.EMAIL_FROM

    await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: store.contactEmail,
      subject: `Supplier Sync Alert — ${products.length} product(s) need attention`,
      html: `
      <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#111827;">Supplier Sync Report</h2>
        <p style="color:#6b7280;">The daily supplier sync found <strong>${products.length}</strong> product(s) that need your attention.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead><tr>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;">Product</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;">Issue</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#6b7280;font-size:14px;">Log in to your admin dashboard to review and update pricing.</p>
      </div>`,
    })
  }
}
