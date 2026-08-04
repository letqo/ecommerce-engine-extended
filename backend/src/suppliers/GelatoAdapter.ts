import axios, { AxiosInstance } from 'axios'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { SupplierSettings, requireSetting, optionalSetting } from './configurableTypes'

// Gelato — global print-on-demand. Docs: https://dashboard.gelato.com/docs/
//
// Gelato splits its API across per-domain hosts rather than paths:
//   orders   → https://order.gelatoapis.com   (v4)
//   products → https://product.gelatoapis.com (v3)
// Auth is one API key sent as `X-API-KEY` on every request, per store.
const ORDER_BASE = 'https://order.gelatoapis.com'
const PRODUCT_BASE = 'https://product.gelatoapis.com'

// Gelato identifies a sellable thing by `productUid` — a long descriptor string like
// `apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_...`. That is what we store in
// ProductVariant.supplierVariantRef.
export class GelatoAdapter implements SupplierAdapter {
  readonly name = 'gelato'

  private orderHttp: AxiosInstance
  private productHttp: AxiosInstance
  // Gelato's product search is scoped to one catalog (`apparel`, `posters`, ...). There is no
  // cross-catalog keyword search, so the store picks which catalog its imports come from.
  private catalogUid: string

  constructor(config: SupplierSettings) {
    const apiKey = requireSetting(config, 'Gelato', 'apiKey')
    this.catalogUid = optionalSetting(config, 'catalogUid') ?? 'posters'
    const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }
    this.orderHttp = axios.create({ baseURL: optionalSetting(config, 'orderBaseUrl') ?? ORDER_BASE, headers })
    this.productHttp = axios.create({ baseURL: optionalSetting(config, 'productBaseUrl') ?? PRODUCT_BASE, headers })
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

  // Not part of the shared SupplierAdapter interface — Gelato-specific, used to let the admin
  // pick which catalog to browse (see the note on `catalogUid` above) instead of guessing at a
  // hardcoded list of catalog names that could go stale.
  async listCatalogs(): Promise<{ catalogUid: string; title: string }[]> {
    const data = await this.request<any>(this.productHttp, 'GET', '/v3/catalogs')
    const rows: any[] = Array.isArray(data) ? data : data?.catalogs ?? []
    return rows.map((r) => ({ catalogUid: String(r.catalogUid ?? r.uid ?? r.id), title: r.title ?? r.name ?? String(r.catalogUid ?? r.uid ?? r.id) }))
  }

  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const offset = (page - 1) * pageSize
    const data = await this.request<any>(this.productHttp, 'POST', `/v3/catalogs/${encodeURIComponent(this.catalogUid)}/products:search`, {
      limit: pageSize,
      offset,
    })
    const rows: any[] = data?.products ?? []
    // The catalog search filters by structured product attributes, not free text, so a
    // keyword is applied client-side over the returned page.
    const needle = query.trim().toLowerCase()
    const matched = needle ? rows.filter((r) => String(r.productUid ?? '').toLowerCase().includes(needle)) : rows

    return {
      products: matched.map((r) => ({
        supplierId: String(r.productUid),
        supplierName: 'gelato',
        title: r.productUid ?? '',
        description: '',
        images: [],
        variants: [],
        categoryName: this.catalogUid,
      })),
      total: data?.hits?.attributeHits ? matched.length : matched.length,
      page,
    }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    const data = await this.request<any>(this.productHttp, 'GET', `/v3/products/${encodeURIComponent(supplierId)}`)
    // A Gelato "product" IS a fully-specified variant (size/colour/paper are baked into the
    // uid), so it maps to exactly one SupplierVariant rather than a variant list.
    const variants: SupplierVariant[] = [
      {
        supplierId: String(data?.productUid ?? supplierId),
        title: data?.productUid ?? supplierId,
        options: Object.fromEntries(
          (data?.productAttributes ?? []).map((a: any) => [a.productAttributeUid, a.productAttributeValueUid])
        ),
        // The catalog endpoint describes the product, not its price — pricing comes from the
        // separate Prices API / order quote. Import seeds 0 and the quote fills it in.
        costPrice: 0,
      },
    ]

    return {
      supplierId: String(data?.productUid ?? supplierId),
      supplierName: 'gelato',
      title: data?.title ?? data?.productUid ?? supplierId,
      description: data?.description ?? '',
      images: [],
      variants,
      categoryName: data?.catalogUid ?? this.catalogUid,
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
