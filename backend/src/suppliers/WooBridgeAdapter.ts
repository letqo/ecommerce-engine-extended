import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { SupplierSettings, requireSetting, optionalSetting } from './configurableTypes'

// WooCommerce Bridge — the generic "no public API" escape hatch.
//
// Most small suppliers have no ordering API at all, but a large share of them DO run a
// WooCommerce storefront (or can stand one up), and WooCommerce ships a complete REST API out
// of the box. This adapter treats any such storefront as a supplier: we place a real order on
// their site over `wc/v3`, and read status/tracking back off that order.
//
// It is intentionally supplier-agnostic — no company name, no bespoke field mapping anywhere in
// this file. Onboarding supplier #2, #3, #N is purely configuration: a base URL, a consumer
// key/secret pair, and a `supplierVariantRef` on each variant holding that supplier's Woo
// product id. See SUPPLIER_FULFILLMENT.md → "Onboarding a no-API supplier".
//
// Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
export class WooBridgeAdapter implements SupplierAdapter {
  readonly name = 'woo_bridge'

  private http: AxiosInstance
  private webhookSecret?: string
  // Purely cosmetic: what this particular bridged supplier is called in the admin UI and on
  // order timelines. Never hardcoded — it comes from the store's settings.
  readonly displayName: string

  constructor(config: SupplierSettings) {
    const baseUrl = requireSetting(config, 'WooCommerce Bridge', 'baseUrl').replace(/\/+$/, '')
    const consumerKey = requireSetting(config, 'WooCommerce Bridge', 'consumerKey')
    const consumerSecret = requireSetting(config, 'WooCommerce Bridge', 'consumerSecret')
    this.webhookSecret = optionalSetting(config, 'webhookSecret')
    this.displayName = optionalSetting(config, 'supplierName') ?? 'WooCommerce supplier'

    this.http = axios.create({
      baseURL: `${baseUrl}/wp-json/wc/v3`,
      // WooCommerce accepts HTTP Basic auth with the consumer key/secret over HTTPS. (Its
      // OAuth1.0a signing scheme is only needed for plain-HTTP sites, which we don't support.)
      auth: { username: consumerKey, password: consumerSecret },
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, opts: { params?: object; body?: object } = {}): Promise<T> {
    try {
      const res = await this.http.request({ method, url: path, params: opts.params, data: opts.body })
      return res.data as T
    } catch (err: any) {
      // WooCommerce errors: { code, message, data: { status } }
      const msg = err.response?.data?.message ?? err.message
      throw new Error(`${this.displayName} (WooCommerce) API error on ${path}: ${msg}`)
    }
  }

  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const rows = await this.request<any[]>('GET', '/products', {
      params: { search: query, page, per_page: pageSize, status: 'publish' },
    })
    const products: SupplierProduct[] = (rows ?? []).map((p) => ({
      supplierId: String(p.id),
      supplierName: this.name,
      title: p.name ?? '',
      description: p.short_description ?? '',
      images: (p.images ?? []).map((img: any) => img.src).filter(Boolean),
      variants: [],
      categoryName: (p.categories ?? [])[0]?.name,
    }))
    return { products, total: products.length, page }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    const p = await this.request<any>('GET', `/products/${encodeURIComponent(supplierId)}`)

    let variants: SupplierVariant[] = []
    if (p.type === 'variable') {
      const rows = await this.request<any[]>('GET', `/products/${encodeURIComponent(supplierId)}/variations`, {
        params: { per_page: 100 },
      })
      variants = (rows ?? []).map((v) => ({
        // For a variable product the ORDER must reference both product_id and variation_id.
        // Encoded as "productId:variationId" in supplierVariantRef and split apart in
        // placeOrder — a single opaque string is all the interface (and the DB column) carries.
        supplierId: `${p.id}:${v.id}`,
        title: (v.attributes ?? []).map((a: any) => a.option).join(' / ') || String(v.id),
        options: Object.fromEntries((v.attributes ?? []).map((a: any) => [a.name, a.option])),
        costPrice: v.price != null ? Number(v.price) : 0,
        imageUrl: v.image?.src,
        stock: v.stock_quantity != null ? Number(v.stock_quantity) : undefined,
      }))
    } else {
      variants = [
        {
          supplierId: String(p.id),
          title: p.name ?? String(p.id),
          options: {},
          costPrice: p.price != null ? Number(p.price) : 0,
          imageUrl: (p.images ?? [])[0]?.src,
          stock: p.stock_quantity != null ? Number(p.stock_quantity) : undefined,
        },
      ]
    }

    return {
      supplierId: String(p.id),
      supplierName: this.name,
      title: p.name ?? '',
      description: p.description ?? '',
      images: (p.images ?? []).map((img: any) => img.src).filter(Boolean),
      variants,
      categoryName: (p.categories ?? [])[0]?.name,
      weight: p.weight ? Number(p.weight) : undefined,
    }
  }

  async placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const a = order.shippingAddress
    const address = {
      first_name: a.firstName,
      last_name: a.lastName,
      address_1: a.address1,
      address_2: a.address2 ?? '',
      city: a.city,
      state: a.province ?? '',
      postcode: a.postalCode,
      country: a.countryCode,
    }

    const data = await this.request<any>('POST', '/orders', {
      body: {
        // `processing` + `set_paid` is the state a supplier's fulfilment workflow reacts to:
        // it means "paid, go pick and pack". A `pending` order would sit in their dashboard
        // waiting for a payment that will never arrive (we settle with the supplier out of
        // band, on account).
        status: 'processing',
        set_paid: true,
        billing: { ...address, phone: a.phone ?? '' },
        shipping: address,
        customer_note: order.remark ?? '',
        // Our own order number, so the supplier's staff and ours are talking about the same
        // thing when something goes wrong.
        meta_data: [{ key: '_source_order_reference', value: order.ourOrderId }],
        line_items: order.items.map((i) => {
          const [productId, variationId] = String(i.variantSupplierId).split(':')
          return {
            product_id: Number(productId),
            ...(variationId ? { variation_id: Number(variationId) } : {}),
            quantity: i.quantity,
          }
        }),
      },
    })

    return { supplierOrderId: String(data?.id), status: data?.status ?? 'processing' }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const data = await this.request<any>('GET', `/orders/${encodeURIComponent(supplierOrderId)}`)
    const tracking = this.extractTracking(data)
    return {
      trackingNumber: tracking.trackingNumber,
      trackingUrl: tracking.trackingUrl,
      carrier: tracking.carrier,
      // WooCommerce statuses: pending, processing, on-hold, completed, cancelled, refunded,
      // failed. `completed` is the supplier's "shipped".
      status: data?.status ?? 'UNKNOWN',
    }
  }

  // Core WooCommerce has no tracking field — tracking is always added by a plugin, and each
  // plugin picks its own meta key. Rather than hardcode one vendor's plugin, this scans the
  // order's meta_data for the handful of key names the common shipment-tracking plugins use,
  // plus any key that simply looks like a tracking field. A supplier whose plugin isn't
  // matched still works: the parcel stays awaiting-tracking and an operator can paste it in
  // by hand, exactly like a MANUAL parcel.
  private extractTracking(order: any): { trackingNumber?: string; trackingUrl?: string; carrier?: string } {
    const meta: any[] = order?.meta_data ?? []
    const pick = (pattern: RegExp): string | undefined => {
      const hit = meta.find((m) => typeof m?.key === 'string' && pattern.test(m.key) && m.value)
      if (!hit) return undefined
      // Some plugins store an array/object of shipments rather than a scalar.
      if (typeof hit.value === 'string') return hit.value
      if (Array.isArray(hit.value)) {
        const first = hit.value[0]
        return typeof first === 'string' ? first : first?.tracking_number ?? first?.number ?? undefined
      }
      return hit.value?.tracking_number ?? hit.value?.number ?? undefined
    }

    return {
      trackingNumber: pick(/tracking[_-]?number|_wc_shipment_tracking_items/i),
      trackingUrl: pick(/tracking[_-]?(url|link)/i),
      carrier: pick(/tracking[_-]?provider|carrier|shipping[_-]?provider/i),
    }
  }

  async checkMarketAvailability(_supplierId: string, _countryCode: string, _variantSupplierId?: string): Promise<MarketAvailability> {
    // A Woo store's shipping coverage lives in its shipping zones, which are configured
    // per-store in ways that don't map cleanly onto a yes/no answer for a single SKU (zone
    // matching depends on the full address, cart contents and enabled methods). Fail open —
    // the same convention CJ uses when it can't confirm — instead of guessing.
    return { available: true }
  }

  // ---- Webhooks -----------------------------------------------------------------------
  //
  // WooCommerce signs every webhook delivery with
  //   X-WC-Webhook-Signature: base64( HMAC-SHA256( rawBody, webhookSecret ) )
  // The secret is set when the webhook is created in the supplier's WooCommerce admin and
  // must be pasted into this store's supplier settings as `webhookSecret`.
  //
  // IMPORTANT: pass the RAW request body (Buffer/string exactly as received). Re-serialising
  // the parsed JSON changes whitespace and key order, and the signature will never match.
  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!this.webhookSecret) return false
    if (!signature) return false
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('base64')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    // Length check first: timingSafeEqual throws on a length mismatch.
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  // Parses an `order.updated` (or order.created) delivery into the same shape the fulfillment
  // service uses elsewhere. Returns null for topics we don't act on.
  parseWebhookEvent(payload: any): { externalOrderId: string; ourOrderRef?: string; status: string; tracking?: SupplierTrackingInfo } | null {
    if (!payload || payload.id == null) return null
    const ourOrderRef = (payload.meta_data ?? []).find((m: any) => m?.key === '_source_order_reference')?.value
    const tracking = this.extractTracking(payload)
    return {
      externalOrderId: String(payload.id),
      ourOrderRef: typeof ourOrderRef === 'string' ? ourOrderRef : undefined,
      status: payload.status ?? 'UNKNOWN',
      tracking: tracking.trackingNumber ? { ...tracking, status: payload.status ?? 'UNKNOWN' } : undefined,
    }
  }
}
