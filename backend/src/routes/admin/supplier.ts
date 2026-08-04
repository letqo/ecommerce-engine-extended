import { Router, Response, NextFunction, Request } from 'express'
import axios from 'axios'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { createAdapter, getConfigurableAdapter } from '../../suppliers/registry'
import { env } from '../../config/env'
import { SupplierAdapter, MarketAvailability } from '../../suppliers/types'
import { computeMarketDeviation, buildDeliveryNote } from '../../suppliers/marketDeviation'
import { isConfigurableSupplierKey, ConfigurableSupplierKey, SupplierSettings } from '../../suppliers/configurableTypes'
import { CONFIGURABLE_SUPPLIERS } from '../../suppliers/configurableRegistry'

const router = Router()

// CJ/AliExpress are env-configured singletons (createAdapter). Everything added since
// (Printful/Gelato/BigBuy/WooBridge) is configured per store via StoreSupplier, so resolving
// one of those requires a storeId and a lookup — this is that single branch point for both the
// search and product-detail routes below, so they don't duplicate the store lookup + friendly
// "not enabled" error.
async function resolveAdapter(storeId: string | undefined, supplierName: string): Promise<SupplierAdapter> {
  if (supplierName === 'cj' || supplierName === 'aliexpress') {
    const adapter = createAdapter(supplierName)
    if (storeId && 'withStore' in adapter) (adapter as any).withStore(storeId)
    return adapter
  }

  const key = supplierName.toUpperCase()
  if (!isConfigurableSupplierKey(key)) throw createError(`Unknown supplier: ${supplierName}`, 400, 'UNKNOWN_SUPPLIER')
  if (!storeId) throw createError('No store in context', 400, 'NO_STORE')

  const storeSupplier = await prisma.storeSupplier.findUnique({
    where: { storeId_supplierKey: { storeId, supplierKey: key as ConfigurableSupplierKey } },
  })
  const meta = CONFIGURABLE_SUPPLIERS[key as ConfigurableSupplierKey]
  if (!storeSupplier?.enabled) {
    throw createError(
      `${meta.displayName} isn't enabled for this store yet — set it up in Admin → Integrations first.`,
      400,
      'SUPPLIER_NOT_CONFIGURED'
    )
  }
  return getConfigurableAdapter(key as ConfigurableSupplierKey, (storeSupplier.settings ?? {}) as SupplierSettings)
}

// ── AliExpress OAuth ──
// /auth + /callback: public popup/redirect flow, not currently linked from the admin UI
// (superseded by the "paste authorization code" flow below, which calls /exchange directly).
// Left in place but unused; if ever re-wired, it needs a way to carry storeId through the
// OAuth roundtrip (e.g. the `state` param) since that flow can't send an X-Store-Id header.

router.get('/aliexpress/auth', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: env.ALIEXPRESS_APP_KEY,
    redirect_uri: `${env.BACKEND_URL}/api/admin/supplier/aliexpress/callback`,
    sp: 'ae',
    state: 'aliexpress-connect',
  })
  res.redirect(`https://oauth.aliexpress.com/authorize?${params.toString()}`)
})

router.get('/aliexpress/callback', (_req: Request, res: Response) => {
  // AliExpress uses implicit flow — token is in the URL hash, only readable by JS
  const adminUrl = env.ADMIN_URL
  res.send(`<!DOCTYPE html>
<html>
<head><title>Connecting AliExpress…</title></head>
<body>
<p style="font-family:sans-serif;padding:2rem">Connecting your AliExpress account…</p>
<script>
  const hash = window.location.hash.slice(1)
  const params = Object.fromEntries(new URLSearchParams(hash))
  const token = params.access_token
  const expiresIn = parseInt(params.expires_in || '0')
  if (!token) {
    document.body.innerHTML = '<p style="color:red;font-family:sans-serif;padding:2rem">Authorization failed — no token received. Go back and try again.</p>'
  } else {
    fetch('/api/admin/supplier/aliexpress/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, expiresIn })
    }).then(r => r.json()).then(data => {
      if (data.success) {
        window.location.href = '${adminUrl}/supplier/import?aliexpress=connected'
      } else {
        document.body.innerHTML = '<p style="color:red;font-family:sans-serif;padding:2rem">Failed to save token: ' + (data.error?.message || 'Unknown error') + '</p>'
      }
    })
  }
</script>
</body>
</html>`)
})

router.post('/aliexpress/exchange', requireAdmin, async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ success: false, error: { message: 'No authorization code provided' } })

    // IopClient signature: HMAC-SHA256(secret, apiPath + sorted_key_value_pairs)
    const crypto = require('crypto')
    const timestamp = String(Date.now())
    const apiPath = '/auth/token/create'
    const params: Record<string, string> = {
      app_key: env.ALIEXPRESS_APP_KEY,
      timestamp,
      sign_method: 'sha256',
      code,
    }
    const secret = env.ALIEXPRESS_APP_SECRET
    const sorted = Object.keys(params).sort()
    const signStr = apiPath + sorted.map((k) => `${k}${params[k]}`).join('')
    params.sign = crypto.createHmac('sha256', secret).update(signStr).digest('hex').toUpperCase()

    const body = new URLSearchParams(params).toString()
    const tokenRes = await axios.post('https://api-sg.aliexpress.com/rest/auth/token/create', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const raw = tokenRes.data
    console.log('[AliExpress token exchange response]', JSON.stringify(raw))
    const data = raw.result ?? raw

    const token = data.access_token ?? data.accessToken
    if (!token) {
      return res.status(400).json({ success: false, error: { message: data.error_description ?? data.msg ?? data.error_msg ?? data.error ?? JSON.stringify(raw) } })
    }

    const expireAt = data.expire_time
      ? new Date(Number(data.expire_time))
      : new Date(Date.now() + 31536000 * 1000)

    if (!req.storeId) throw createError('No active store', 400, 'NO_STORE')
    const store = await prisma.store.findUnique({ where: { id: req.storeId } })
    if (!store) throw createError('Store not found', 404, 'NOT_FOUND')

    await prisma.store.update({
      where: { id: store.id },
      data: { aliexpressAccessToken: token, aliexpressTokenExpiry: expireAt },
    })

    res.json({ success: true })
  } catch (err: any) {
    const msg = err?.response?.data?.error_description ?? err?.response?.data?.error ?? err?.message ?? 'Token exchange failed'
    next(Object.assign(new Error(msg), { statusCode: 400 }))
  }
})

router.post('/aliexpress/token', requireAdmin, async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { token, expiresIn } = req.body
    if (token === undefined) return res.status(400).json({ success: false, error: { message: 'token field required' } })

    if (!req.storeId) return res.status(400).json({ success: false, error: { message: 'No active store' } })
    const store = await prisma.store.findUnique({ where: { id: req.storeId } })
    if (!store) return res.status(404).json({ success: false, error: { message: 'Store not found' } })

    // empty string = disconnect
    const isDisconnect = !token
    await prisma.store.update({
      where: { id: store.id },
      data: {
        aliexpressAccessToken: isDisconnect ? null : token,
        aliexpressTokenExpiry: isDisconnect ? null : new Date(Date.now() + (expiresIn || 31536000) * 1000),
      },
    })

    res.json({ success: true })
  } catch (err) { next(err) }
})

router.get('/aliexpress/status', requireAdmin, async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const store = req.storeId
      ? await prisma.store.findUnique({
          where: { id: req.storeId },
          select: { aliexpressAccessToken: true, aliexpressTokenExpiry: true },
        })
      : null
    const connected = !!store?.aliexpressAccessToken &&
      (!store.aliexpressTokenExpiry || store.aliexpressTokenExpiry > new Date())
    res.json({ success: true, data: { connected, expiry: store?.aliexpressTokenExpiry ?? null } })
  } catch (err) { next(err) }
})

router.use(requireAdmin)

router.get('/search', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { q, page = '1', supplier = 'cj' } = req.query as { q?: string; page?: string; supplier?: string }
    if (!q?.trim()) return res.json({ success: true, data: { products: [], total: 0, page: 1 } })
    const adapter = await resolveAdapter(req.storeId, supplier)
    const result = await adapter.searchProducts(q.trim(), parseInt(page))
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.get('/product/:supplierId', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = (req.query.supplier as string) || 'cj'
    const adapter = await resolveAdapter(req.storeId, supplier)
    const product = await adapter.getProduct(req.params.supplierId)

    const store = req.storeId
      ? await prisma.store.findUnique({ where: { id: req.storeId }, select: { targetMarkets: true } })
      : await prisma.store.findFirst({ select: { targetMarkets: true } })
    const targetMarkets = store?.targetMarkets ?? []
    const firstVariantId = product.variants[0]?.supplierId

    const marketAvailability: Record<string, boolean> = {}
    const marketDetail: Record<string, MarketAvailability> = {}
    await Promise.allSettled(
      targetMarkets.map(async (country) => {
        try {
          const result = await adapter.checkMarketAvailability(req.params.supplierId, country, firstVariantId)
          marketAvailability[country] = result.available
          marketDetail[country] = result
        } catch {
          marketAvailability[country] = true // couldn't confirm — don't falsely flag as unavailable
          marketDetail[country] = { available: true }
        }
      })
    )
    const marketDeviationWarnings = computeMarketDeviation(marketDetail)
    const deliveryNote = buildDeliveryNote(product.deliveryMinDays, product.deliveryMaxDays, marketDetail)

    res.json({ success: true, data: { ...product, marketAvailability, marketDeviationWarnings, deliveryNote } })
  } catch (err) { next(err) }
})

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function importSupplierProduct(storeId: string | undefined, body: any) {
  const { supplierId, supplierName, title, description, markup, images, variants, listVariantsIndividually, videoUrl, deliveryMinDays, deliveryMaxDays, shippingCost, categoryId, unavailableMarkets, deliveryNote } = body
  // An explicit per-import markup (from the Import Products form, or the assistant passing a
  // number the owner asked for) always wins. Only when none is given do we fall back to the
  // store's configured default — never the other way around.
  let appliedMarkup = typeof markup === 'number' && markup > 0 ? markup : undefined
  if (appliedMarkup == null) {
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { defaultImportMarkup: true } })
      : null
    appliedMarkup = store?.defaultImportMarkup ?? 2.5
  }
  // Per-unit cost to actually fulfill via the supplier — often larger than the item cost
  // itself on cheap items. Folded into every variant's landed cost so price/costPerItem
  // reflect what it really costs to ship the order, not just the item's list price.
  const perUnitShipping = typeof shippingCost === 'number' && shippingCost > 0 ? shippingCost : 0

  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const slug = `${base}-${Date.now()}`

  // CJ/AliExpress keep their own dedicated id columns (pre-existing). Every supplier added
  // since routes through the generic Product.supplierKey / ProductVariant.supplierVariantRef
  // pair instead — see classifySupplier() in supplierOrderFulfillment.ts, which is what actually
  // reads these at order time to know where to send the parcel.
  const configurableKey = supplierName.toUpperCase()
  const isConfigurable = isConfigurableSupplierKey(configurableKey)

  return prisma.product.create({
    data: {
      title,
      slug,
      description: description ?? '',
      status: 'DRAFT',
      storeId,
      categoryId: categoryId ?? null,
      videoUrl: videoUrl ?? null,
      listVariantsIndividually: listVariantsIndividually === true,
      deliveryMinDays: deliveryMinDays > 0 ? deliveryMinDays : null,
      deliveryMaxDays: deliveryMaxDays > 0 ? deliveryMaxDays : null,
      cjProductId: supplierName === 'cj' ? supplierId : undefined,
      aliexpressProductId: supplierName === 'aliexpress' ? supplierId : undefined,
      supplierKey: isConfigurable ? (configurableKey as ConfigurableSupplierKey) : undefined,
      unavailableMarkets: Array.isArray(unavailableMarkets) ? unavailableMarkets : [],
      deliveryNote: typeof deliveryNote === 'string' && deliveryNote.trim() ? deliveryNote : null,
      images: {
        create: (images as string[]).slice(0, 8).map((url: string, i: number) => ({
          url,
          sortOrder: i,
        })),
      },
      variants: {
        create: (variants as any[]).map((v: any, i: number) => {
          const landedCost = Math.round(((v.costPrice ?? 0) + perUnitShipping) * 100) / 100
          return {
            title: Object.values(v.options as Record<string, string>).join(' / ') || v.title || 'Default',
            options: v.options ?? {},
            price: Math.round(landedCost * appliedMarkup * 100) / 100,
            costPerItem: landedCost,
            inventoryQty: v.stock ?? 0,
            trackInventory: true,
            isDefault: i === 0,
            imageUrl: v.imageUrl ?? null,
            cjVariantId: supplierName === 'cj' ? v.supplierId : undefined,
            aliexpressSkuId: supplierName === 'aliexpress' ? v.supplierId : undefined,
            aliexpressSkuAttr: supplierName === 'aliexpress' ? (v.skuAttr ?? null) : undefined,
            supplierVariantRef: isConfigurable ? v.supplierId : undefined,
          }
        }),
      },
    },
    include: { images: true, variants: true },
  })
}

router.post('/import', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const product = await importSupplierProduct((req as any).storeId, req.body)
    res.json({ success: true, data: product })
  } catch (err) { next(err) }
})

export default router
