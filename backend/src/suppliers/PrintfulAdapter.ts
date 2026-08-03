import axios, { AxiosInstance } from 'axios'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { SupplierSettings, requireSetting, optionalSetting } from './configurableTypes'

// Printful — print-on-demand. Docs: https://developers.printful.com/docs/
//
// Auth is a per-store private token (`Authorization: Bearer <token>`). Account-level tokens
// additionally need `X-PF-Store-Id` to say which Printful store to act on; store-level tokens
// don't, so it's optional here.
//
// This adapter is deliberately built on the stable v1 REST API (https://api.printful.com)
// rather than the v2 beta — v1 is what the public docs fully specify today, and the v2 beta's
// shapes are still moving. Switching later is a contained change inside this file.
const DEFAULT_BASE_URL = 'https://api.printful.com'

export class PrintfulAdapter implements SupplierAdapter {
  readonly name = 'printful'

  private http: AxiosInstance

  constructor(config: SupplierSettings) {
    const token = requireSetting(config, 'Printful', 'apiToken')
    const storeId = optionalSetting(config, 'storeId')
    const baseUrl = optionalSetting(config, 'baseUrl') ?? DEFAULT_BASE_URL

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
      },
    })
  }

  // Printful wraps every response as { code, result, ... } and mirrors the HTTP status in
  // `code`. Non-200 codes carry the message under `result` (a string) or `error.message`.
  private async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { params?: object; body?: object } = {}): Promise<T> {
    try {
      const res = await this.http.request({ method, url: path, params: opts.params, data: opts.body })
      const payload = res.data
      if (payload && typeof payload.code === 'number' && payload.code >= 300) {
        throw new Error(typeof payload.result === 'string' ? payload.result : payload.error?.message ?? 'Unknown error')
      }
      return (payload?.result ?? payload) as T
    } catch (err: any) {
      const body = err.response?.data
      const msg = (typeof body?.result === 'string' ? body.result : undefined) ?? body?.error?.message ?? err.message
      throw new Error(`Printful API error on ${path}: ${msg}`)
    }
  }

  // Printful's store-products endpoint has no keyword parameter — it returns the store's whole
  // sync-product list with offset/limit paging. Filtering client-side over one page is honest
  // and cheap; it just means "search" is a filter over your own Printful store, not over
  // Printful's full catalog (which is browsed by catalog id, not by keyword).
  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const offset = (page - 1) * pageSize
    const result = await this.request<any>('GET', '/store/products', { params: { offset, limit: pageSize } })
    const rows: any[] = Array.isArray(result) ? result : result?.items ?? []
    const needle = query.trim().toLowerCase()
    const matched = needle ? rows.filter((r) => String(r.name ?? '').toLowerCase().includes(needle)) : rows

    const products: SupplierProduct[] = matched.map((r) => ({
      supplierId: String(r.id),
      supplierName: 'printful',
      title: r.name ?? '',
      description: '',
      images: r.thumbnail_url ? [r.thumbnail_url] : [],
      variants: [],
    }))

    return { products, total: products.length, page }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    // GET /store/products/{id} → { sync_product, sync_variants }
    const data = await this.request<any>('GET', `/store/products/${encodeURIComponent(supplierId)}`)
    const sync = data?.sync_product ?? data
    const syncVariants: any[] = data?.sync_variants ?? []

    const images: string[] = []
    if (sync?.thumbnail_url) images.push(sync.thumbnail_url)
    for (const v of syncVariants) {
      for (const f of v.files ?? []) {
        const url = f.preview_url ?? f.thumbnail_url
        if (url && !images.includes(url)) images.push(url)
      }
    }

    const variants: SupplierVariant[] = syncVariants.map((v) => ({
      // The sync-variant id is what `POST /orders` accepts as `sync_variant_id`, and is what we
      // persist to ProductVariant.supplierVariantRef.
      supplierId: String(v.id),
      title: v.name ?? String(v.id),
      options: v.variant_id ? ({ 'Catalog variant': String(v.variant_id) } as Record<string, string>) : {},
      // `retail_price` is what the seller charges; the real cost to fulfil is on the order's
      // cost breakdown, which isn't available per-variant here. retail_price is the closest
      // per-variant number Printful exposes, so it seeds costPerItem on import.
      costPrice: v.retail_price != null ? Number(v.retail_price) : 0,
      imageUrl: (v.files ?? []).find((f: any) => f.preview_url)?.preview_url ?? undefined,
      stock: v.availability_status === 'active' ? undefined : 0,
    }))

    return {
      supplierId: String(sync?.id ?? supplierId),
      supplierName: 'printful',
      title: sync?.name ?? '',
      description: '',
      images,
      variants,
    }
  }

  async placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const a = order.shippingAddress
    // `?confirm=1` creates the order already confirmed for fulfilment. Without it Printful
    // parks the order as a draft that a human has to confirm in the dashboard, which would
    // silently stall every order this platform submits.
    const result = await this.request<any>('POST', '/orders', {
      params: { confirm: 1 },
      body: {
        external_id: order.ourOrderId,
        recipient: {
          name: `${a.firstName} ${a.lastName}`.trim(),
          address1: a.address1,
          address2: a.address2 ?? '',
          city: a.city,
          state_code: a.province ?? '',
          country_code: a.countryCode,
          zip: a.postalCode,
          phone: a.phone ?? '',
        },
        items: order.items.map((i) => ({
          sync_variant_id: Number(i.variantSupplierId),
          quantity: i.quantity,
        })),
        ...(order.remark ? { packing_slip: { message: order.remark } } : {}),
      },
    })

    return { supplierOrderId: String(result?.id ?? order.ourOrderId), status: result?.status ?? 'pending' }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const result = await this.request<any>('GET', `/orders/${encodeURIComponent(supplierOrderId)}`)
    const shipment = (result?.shipments ?? [])[0]
    return {
      trackingNumber: shipment?.tracking_number ?? undefined,
      trackingUrl: shipment?.tracking_url ?? undefined,
      carrier: shipment?.carrier ?? undefined,
      // Printful order statuses: draft, pending, failed, canceled, inprocess, onhold, partial,
      // fulfilled. Passed through verbatim — SupplierOrder.externalStatus is free text.
      status: result?.status ?? 'UNKNOWN',
    }
  }

  async checkMarketAvailability(_supplierId: string, countryCode: string, variantSupplierId?: string): Promise<MarketAvailability> {
    // No variant means nothing concrete to rate — fail open rather than block an import, the
    // same convention the CJ adapter uses.
    if (!variantSupplierId) return { available: true }
    try {
      const rates = await this.request<any>('POST', '/shipping/rates', {
        body: {
          recipient: { country_code: countryCode },
          items: [{ sync_variant_id: Number(variantSupplierId), quantity: 1 }],
        },
      })
      const options: any[] = Array.isArray(rates) ? rates : []
      if (options.length === 0) return { available: false }
      const best = options[0]
      return {
        available: true,
        deliveryMinDays: best?.minDeliveryDays ?? undefined,
        deliveryMaxDays: best?.maxDeliveryDays ?? undefined,
        shippingCost: best?.rate != null ? Number(best.rate) : undefined,
      }
    } catch {
      // A failed check is not a confirmed "no route" — fail open (same reasoning as CJAdapter).
      return { available: true }
    }
  }

  // ---- Webhooks -----------------------------------------------------------------------
  //
  // Printful pushes events as `{ type, created, retries, store, data }`. `package_shipped`
  // carries `data.shipment` (carrier/tracking_number/tracking_url) and `data.order`
  // (with our `external_id`). Printful does NOT sign webhook payloads — the documented
  // protection is a secret/unguessable callback URL, so the route that mounts this must use
  // one. See SUPPLIER_FULFILLMENT.md.
  parseWebhookEvent(payload: any): { type: string; externalOrderId?: string; ourOrderRef?: string; tracking?: SupplierTrackingInfo } | null {
    if (!payload || typeof payload.type !== 'string') return null
    const order = payload.data?.order
    const shipment = payload.data?.shipment
    return {
      type: payload.type,
      externalOrderId: order?.id != null ? String(order.id) : undefined,
      ourOrderRef: order?.external_id ?? undefined,
      tracking: shipment
        ? {
            trackingNumber: shipment.tracking_number ?? undefined,
            trackingUrl: shipment.tracking_url ?? undefined,
            carrier: shipment.carrier ?? undefined,
            status: payload.type,
          }
        : undefined,
    }
  }
}
