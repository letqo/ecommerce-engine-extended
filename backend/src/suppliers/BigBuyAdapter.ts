import axios, { AxiosInstance } from 'axios'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { SupplierSettings, requireSetting, optionalSetting } from './configurableTypes'

// BigBuy — European wholesale dropshipping (ships from Spain, EU-wide).
// Docs: https://api.bigbuy.eu/rest/doc  ·  guide: https://www.bigbuy.eu/en/api_bigbuy.html
//
// Auth: `Authorization: Bearer <API_KEY>`, one key per BigBuy account, so it lives per store.
// Every path takes a `.{format}` suffix — this adapter always uses `.json`.
const PRODUCTION_BASE = 'https://api.bigbuy.eu'
const SANDBOX_BASE = 'https://api.sandbox.bigbuy.eu'

export class BigBuyAdapter implements SupplierAdapter {
  readonly name = 'bigbuy'

  private http: AxiosInstance
  private isoCode: string
  // BigBuy requires a payment method on every order. "moneybox" = draw from the prepaid BigBuy
  // wallet, which is the normal dropshipping setup; overridable per store.
  private paymentMethod: string
  // Optional preferred carrier names, in order. BigBuy picks the cheapest available if the
  // list is empty.
  private carriers: string[]
  // BigBuy requires an email on the shipping address; see placeOrder for why it's the store's
  // own address rather than the customer's.
  private notificationEmail?: string

  constructor(config: SupplierSettings) {
    const apiKey = requireSetting(config, 'BigBuy', 'apiKey')
    const sandbox = (optionalSetting(config, 'sandbox') ?? 'false').toLowerCase() === 'true'
    this.isoCode = optionalSetting(config, 'isoCode') ?? 'en'
    this.paymentMethod = optionalSetting(config, 'paymentMethod') ?? 'moneybox'
    this.carriers = (optionalSetting(config, 'carriers') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    this.notificationEmail = optionalSetting(config, 'notificationEmail')

    this.http = axios.create({
      baseURL: optionalSetting(config, 'baseUrl') ?? (sandbox ? SANDBOX_BASE : PRODUCTION_BASE),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })
  }

  private async request<T>(method: 'GET' | 'POST', path: string, opts: { params?: object; body?: object } = {}): Promise<T> {
    try {
      const res = await this.http.request({ method, url: path, params: opts.params, data: opts.body })
      return res.data as T
    } catch (err: any) {
      const body = err.response?.data
      const msg = body?.message ?? (Array.isArray(body?.errors) ? body.errors.map((e: any) => e.message ?? e).join('; ') : undefined) ?? err.message
      // BigBuy rate-limits hard (documented per-endpoint, e.g. 1 request / 5 seconds) and
      // answers 429 — surface that plainly so the retry logic's message is readable.
      const prefix = err.response?.status === 429 ? 'BigBuy rate limit' : 'BigBuy API error'
      throw new Error(`${prefix} on ${path}: ${msg}`)
    }
  }

  // BigBuy exposes no keyword-search endpoint — the catalog is meant to be bulk-downloaded and
  // indexed on the integrator's side. The one targeted lookup available is by SKU/reference, so
  // that's what "search" does here. Saying so beats returning a silently-empty result set.
  async searchProducts(query: string, page = 1): Promise<SupplierSearchResult> {
    const sku = query.trim()
    if (!sku) return { products: [], total: 0, page }
    try {
      const data = await this.request<any>('GET', `/rest/catalog/productinformationbysku/${encodeURIComponent(sku)}.json`, {
        params: { isoCode: this.isoCode },
      })
      const rows: any[] = Array.isArray(data) ? data : data ? [data] : []
      return {
        products: rows.map((r) => ({
          supplierId: String(r.id ?? r.sku ?? sku),
          supplierName: 'bigbuy',
          title: r.name ?? '',
          description: r.description ?? '',
          images: [],
          variants: [],
        })),
        total: rows.length,
        page,
      }
    } catch {
      // A miss on an unknown SKU is a 404 — an empty result, not an error worth surfacing.
      return { products: [], total: 0, page }
    }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    const id = encodeURIComponent(supplierId)
    // BigBuy splits one product across three endpoints: commercial data, localised text, and
    // images. Fetched together (they're independently rate-limited, so failures are tolerated
    // per-part rather than failing the whole import).
    const [product, info, images] = await Promise.all([
      this.request<any>('GET', `/rest/catalog/product/${id}.json`, { params: { isoCode: this.isoCode } }).catch(() => null),
      this.request<any>('GET', `/rest/catalog/productinformation/${id}.json`, { params: { isoCode: this.isoCode } }).catch(() => null),
      this.request<any>('GET', `/rest/catalog/productimages/${id}.json`).catch(() => null),
    ])

    const imageUrls: string[] = (images?.images ?? images ?? [])
      .map((img: any) => img?.url ?? img?.image ?? null)
      .filter(Boolean)

    // A BigBuy product is a single sellable SKU — no variant axis. `sku` is the reference the
    // order endpoint expects, so it becomes supplierVariantRef.
    const reference = String(product?.sku ?? info?.sku ?? supplierId)
    const variants: SupplierVariant[] = [
      {
        supplierId: reference,
        title: info?.name ?? reference,
        options: {},
        costPrice: product?.wholesalePrice != null ? Number(product.wholesalePrice) : Number(product?.retailPrice ?? 0),
        imageUrl: imageUrls[0],
        stock: product?.stock != null ? Number(product.stock) : undefined,
      },
    ]

    return {
      supplierId: String(product?.id ?? supplierId),
      supplierName: 'bigbuy',
      title: info?.name ?? '',
      description: info?.description ?? '',
      images: imageUrls,
      variants,
      categoryId: product?.category != null ? String(product.category) : undefined,
      weight: product?.weight != null ? Number(product.weight) : undefined,
    }
  }

  async placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const a = order.shippingAddress
    const data = await this.request<any>('POST', '/rest/order/create.json', {
      body: {
        order: {
          internalReference: order.ourOrderId,
          language: this.isoCode,
          paymentMethod: this.paymentMethod,
          carriers: this.carriers.map((name) => ({ name })),
          shippingAddress: {
            firstName: a.firstName,
            lastName: a.lastName,
            country: a.countryCode,
            postcode: a.postalCode,
            town: a.city,
            address: [a.address1, a.address2].filter(Boolean).join(', '),
            phone: a.phone ?? '',
            // BigBuy requires an email on the shipping address. The customer's email isn't in
            // SupplierOrderRequest (the interface carries a postal address only), and passing a
            // fake one would send BigBuy's shipping notices into a black hole — so the store's
            // own notification address is used, set per store in Integrations. Falls back to
            // an empty string, which BigBuy rejects loudly rather than silently mis-delivering.
            email: this.notificationEmail ?? '',
            comment: order.remark ?? '',
          },
          products: order.items.map((i) => ({ reference: i.variantSupplierId, quantity: i.quantity })),
        },
      },
    })

    return { supplierOrderId: String(data?.order_id ?? data?.id ?? order.ourOrderId), status: String(data?.status ?? 'created') }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const data = await this.request<any>('GET', `/rest/tracking/order/${encodeURIComponent(supplierOrderId)}.json`)
    const tracking = Array.isArray(data?.trackings) ? data.trackings[0] : Array.isArray(data) ? data[0] : data
    return {
      trackingNumber: tracking?.trackingNumber ?? undefined,
      trackingUrl: tracking?.url ?? tracking?.trackingUrl ?? undefined,
      carrier: tracking?.carrier?.name ?? tracking?.carrier ?? undefined,
      status: tracking?.statusDescription ?? tracking?.status ?? data?.status ?? 'UNKNOWN',
    }
  }

  async checkMarketAvailability(_supplierId: string, _countryCode: string, _variantSupplierId?: string): Promise<MarketAvailability> {
    // TODO(real-docs-needed): BigBuy's shipping-cost/coverage endpoint isn't in the public
    // OpenAPI description (only `/rest/shipping/carriers.json`, which lists carriers globally
    // rather than answering "can you ship SKU X to country Y"). Rather than invent a request
    // shape, this fails open — consistent with how CJ treats an unconfirmable check. Wire the
    // real endpoint once BigBuy grants API access and their full docs are readable.
    return { available: true }
  }
}
