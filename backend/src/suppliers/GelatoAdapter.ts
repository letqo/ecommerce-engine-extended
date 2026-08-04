import axios, { AxiosInstance } from 'axios'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { SupplierSettings, requireSetting, optionalSetting } from './configurableTypes'

// Gelato — global print-on-demand. Docs: https://dashboard.gelato.com/docs/ (blocked from
// automated fetching — everything below was confirmed live, 2026-08-04, against a real account).
//
// Gelato splits its API across per-domain hosts rather than paths:
//   orders     → https://order.gelatoapis.com     (v4)
//   catalog    → https://product.gelatoapis.com   (v3) — the universal blank-template catalog
//   e-commerce → https://ecommerce.gelatoapis.com (v1) — the merchant's OWN created products
// Auth is one API key sent as `X-API-KEY` on every request, per store.
//
// searchProducts/getProduct deliberately read the e-commerce API, not the catalog one. The
// catalog API (product.gelatoapis.com) is Gelato's full universal template list — hundreds of
// thousands of blank products (465k+ in "apparel" alone) with no working server-side filter
// (every `filters` shape tried against the real API was silently ignored), so it's only useful
// for *creating a brand-new design from a blank template*, not for finding a product the
// merchant already made — that's exactly what the e-commerce "store products" API is for, the
// same role Printful's `/store/products` plays for that adapter. Every product created via
// Gelato's own dashboard ("My Store" → Add Product) shows up there with a real title, a real
// description, a real preview image, and variants carrying the same productUid format the
// catalog/order APIs use — so placeOrder needs no changes.
const ORDER_BASE = 'https://order.gelatoapis.com'
const ECOMMERCE_BASE = 'https://ecommerce.gelatoapis.com'

// Gelato identifies a sellable thing by `productUid` — a long descriptor string like
// `apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_...`. That is what we store in
// ProductVariant.supplierVariantRef.
export class GelatoAdapter implements SupplierAdapter {
  readonly name = 'gelato'

  private orderHttp: AxiosInstance
  private ecommerceHttp: AxiosInstance
  // A Gelato account has exactly one e-commerce "store" object (confirmed live — GET /v1/stores
  // returned a single entry, type "manual", created automatically the first time the API key is
  // used to connect a custom/non-native storefront). Resolved lazily and cached, since every
  // e-commerce call needs it and it never changes for the life of this adapter instance.
  private storeIdPromise: Promise<string> | null = null

  constructor(config: SupplierSettings) {
    const apiKey = requireSetting(config, 'Gelato', 'apiKey')
    const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }
    this.orderHttp = axios.create({ baseURL: optionalSetting(config, 'orderBaseUrl') ?? ORDER_BASE, headers })
    this.ecommerceHttp = axios.create({ baseURL: optionalSetting(config, 'ecommerceBaseUrl') ?? ECOMMERCE_BASE, headers })
  }

  private async request<T>(http: AxiosInstance, method: 'GET' | 'POST' | 'PATCH', path: string, body?: object): Promise<T> {
    try {
      const res = await http.request({ method, url: path, data: body })
      return res.data as T
    } catch (err: any) {
      // Gelato errors come back as { code, message }.
      const msg = err.response?.data?.message ?? err.response?.data?.code ?? err.message
      throw new Error(`Gelato API error on ${path}: ${msg}`)
    }
  }

  private async resolveStoreId(): Promise<string> {
    if (!this.storeIdPromise) {
      this.storeIdPromise = this.request<any>(this.ecommerceHttp, 'GET', '/v1/stores').then((data) => {
        const store = (data?.stores ?? [])[0]
        if (!store?.id) throw new Error('No Gelato store found on this account — connect a store at dashboard.gelato.com first.')
        return String(store.id)
      })
    }
    return this.storeIdPromise
  }

  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const storeId = await this.resolveStoreId()
    // No documented limit/offset for this endpoint and a merchant's own product count is small
    // (this is their catalog, not Gelato's) — fetch generously and paginate/filter client-side,
    // the same pattern used elsewhere in this codebase for supplier lists too small to need
    // real server-side paging.
    const data = await this.request<any>(this.ecommerceHttp, 'GET', `/v1/stores/${storeId}/products?limit=250`)
    const rows: any[] = data?.products ?? []
    const needle = query.trim().toLowerCase()
    const matched = needle ? rows.filter((r) => String(r.title ?? '').toLowerCase().includes(needle)) : rows

    const start = (page - 1) * pageSize
    const pageRows = matched.slice(start, start + pageSize)

    return {
      products: pageRows.map((r) => ({
        supplierId: String(r.id),
        supplierName: 'gelato',
        title: r.title ?? '',
        description: r.description ?? '',
        images: r.previewUrl ? [r.previewUrl] : [],
        variants: [],
      })),
      total: matched.length,
      page,
    }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    const storeId = await this.resolveStoreId()
    const data = await this.request<any>(this.ecommerceHttp, 'GET', `/v1/stores/${storeId}/products/${encodeURIComponent(supplierId)}`)

    // previewUrl (and any productImages) are pre-signed S3 URLs that expire in ~24h — the caller
    // (importSupplierProduct) re-hosts them via our own storage before saving, so this doesn't
    // matter for the search/preview step, only for what ends up permanently stored.
    const images: string[] = [data?.previewUrl, ...((data?.productImages ?? []) as any[]).map((i) => i?.url ?? i?.previewUrl ?? (typeof i === 'string' ? i : null))]
      .filter((u): u is string => typeof u === 'string' && u.length > 0)

    const variants: SupplierVariant[] = (data?.variants ?? []).map((v: any) => ({
      // The productUid (not the internal variant id) is what placeOrder sends to Gelato, so it's
      // what gets persisted to ProductVariant.supplierVariantRef.
      supplierId: String(v.productUid),
      title: v.title ?? String(v.productUid),
      options: {},
      // Store products carry no per-variant price either — same limitation as the catalog API,
      // documented at import time via the admin UI's "didn't return a cost" notice.
      costPrice: 0,
    }))

    return {
      supplierId: String(data?.id ?? supplierId),
      supplierName: 'gelato',
      title: data?.title ?? '',
      description: data?.description ?? '',
      images,
      variants,
      categoryName: data?.productType ?? undefined,
    }
  }

  async placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const a = order.shippingAddress
    const data = await this.request<any>(this.orderHttp, 'POST', '/v4/orders', {
      orderType: 'order',
      orderReferenceId: order.ourOrderId,
      // Gelato requires a customer reference. This platform doesn't keep a Gelato-side
      // customer registry, so the order reference doubles as it — one "customer" per order is
      // valid and keeps orders from being cross-linked.
      customerReferenceId: order.ourOrderId,
      items: order.items.map((i, idx) => ({
        itemReferenceId: `${order.ourOrderId}-${idx + 1}`,
        productUid: i.variantSupplierId,
        quantity: i.quantity,
        // Print-ready artwork — Product.printFiles, resolved by the caller (see
        // supplierOrderFulfillment.ts, which also refuses to submit a Gelato order missing this
        // rather than let Gelato reject it with a less actionable error).
        ...(i.files && i.files.length > 0 ? { files: i.files } : {}),
      })),
      shippingAddress: {
        firstName: a.firstName,
        lastName: a.lastName,
        addressLine1: a.address1,
        addressLine2: a.address2 ?? '',
        city: a.city,
        postCode: a.postalCode,
        state: a.province ?? '',
        country: a.countryCode,
        phone: a.phone ?? '',
      },
    })

    return { supplierOrderId: String(data?.id ?? order.ourOrderId), status: data?.fulfillmentStatus ?? 'created' }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const data = await this.request<any>(this.orderHttp, 'GET', `/v4/orders/${encodeURIComponent(supplierOrderId)}`)
    // TODO(real-docs-needed): exact tracking field path. The published Order schema documents
    // `fulfillmentStatus` and a `shipment` summary but not where the carrier tracking code
    // lands. Gelato's own examples put it on each item's `fulfillments[]`, so both plausible
    // locations are read defensively rather than guessing one and silently returning nothing.
    const fulfillment =
      (data?.items ?? []).flatMap((i: any) => i.fulfillments ?? [])[0] ?? data?.fulfillments?.[0] ?? undefined

    return {
      trackingNumber: fulfillment?.trackingCode ?? fulfillment?.trackingNumber ?? undefined,
      trackingUrl: fulfillment?.trackingUrl ?? undefined,
      carrier: fulfillment?.shipmentMethodName ?? data?.shipment?.shipmentMethodName ?? undefined,
      status: data?.fulfillmentStatus ?? 'UNKNOWN',
    }
  }

  async checkMarketAvailability(supplierId: string, countryCode: string, variantSupplierId?: string): Promise<MarketAvailability> {
    const productUid = variantSupplierId ?? supplierId
    if (!productUid) return { available: true }
    try {
      const data = await this.request<any>(this.orderHttp, 'POST', '/v4/orders:quote', {
        orderReferenceId: `availability-check-${Date.now()}`,
        customerReferenceId: 'availability-check',
        recipient: { country: countryCode },
        products: [{ itemReferenceId: 'check-1', productUid, quantity: 1 }],
      })
      const quote = (data?.quotes ?? [])[0]
      const shipment = (quote?.shipmentMethods ?? [])[0]
      if (!quote) return { available: false }
      return {
        available: true,
        deliveryMinDays: shipment?.minDeliveryDays ?? undefined,
        deliveryMaxDays: shipment?.maxDeliveryDays ?? undefined,
        shippingCost: shipment?.price != null ? Number(shipment.price) : undefined,
      }
    } catch {
      // Couldn't confirm ≠ confirmed unavailable — fail open, as elsewhere in this codebase.
      return { available: true }
    }
  }
}
