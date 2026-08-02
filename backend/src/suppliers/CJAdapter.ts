import axios from 'axios'
import { env } from '../config/env'
import { prisma } from '../config/database'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { extractDescriptionImages, processDescriptionImages, stripDescriptionImages } from './extractDescriptionImages'

const BASE = env.CJ_API_BASE_URL + '/v1'

// CJ's freightCalculate endpoint returns `logisticAging` — shipping/transit time only,
// starting from when the carrier picks up the package. It does NOT include CJ's own
// warehouse processing time (sourcing + packing before handoff to the carrier), which
// CJ documents as typically 1-3 business days. Without adding it, the storefront's
// delivery estimate is too early for every CJ-sourced product.
const CJ_PROCESSING_MIN_DAYS = 1
const CJ_PROCESSING_MAX_DAYS = 3

export class CJAdapter implements SupplierAdapter {
  readonly name = 'cj'

  // CJ product URLs look like https://cjdropshipping.com/product/xxx-p-1234567.html
  // (pid is sometimes alphanumeric, not always numeric) — fall back to the raw
  // trimmed input if no URL pattern matches, so a plain pid still works.
  extractProductId(input: string): string {
    const m = input.match(/-p-([A-Za-z0-9]+)\.html/) ?? input.match(/[?&]pid=([A-Za-z0-9]+)/)
    return m ? m[1] : input.trim()
  }

  private storeId?: string
  static openId: string | null = null
  // Token cache is shared across every CJAdapter instance (checkout/import code creates a
  // fresh instance per item/product) — instance-scoped caching meant concurrent instances
  // each independently raced to fetch their own token, unthrottled, colliding with CJ's rate
  // limit before ever reaching the throttled retry logic below.
  private static token: string | null = null
  private static tokenExpiry: Date | null = null
  private static tokenPromise: Promise<string> | null = null

  withStore(storeId: string): this {
    this.storeId = storeId
    return this
  }

  private async getCountry(): Promise<string> {
    const store = this.storeId
      ? await prisma.store.findUnique({ where: { id: this.storeId }, select: { shipToCountry: true } })
      : await prisma.store.findFirst({ select: { shipToCountry: true } })
    return store?.shipToCountry ?? 'US'
  }

  private async getToken(): Promise<string> {
    if (CJAdapter.token && CJAdapter.tokenExpiry && new Date() < CJAdapter.tokenExpiry) {
      return CJAdapter.token
    }
    // Concurrent callers with no cached token yet share the same in-flight fetch instead of
    // each independently hitting the auth endpoint (which is subject to the same QPS limit).
    if (CJAdapter.tokenPromise) return CJAdapter.tokenPromise
    CJAdapter.tokenPromise = (async () => {
      try {
        if (!env.CJ_API_KEY) throw new Error('CJ_API_KEY not set in environment variables.')
        await CJAdapter.throttle()
        const res = await axios.post(`${BASE}/authentication/getAccessToken`, {
          apiKey: env.CJ_API_KEY,
        })
        if (res.data.code !== 200) throw new Error(`CJ auth failed: ${res.data.message}`)
        CJAdapter.token = res.data.data.accessToken
        if (res.data.data.openId) CJAdapter.openId = String(res.data.data.openId)
        const expiry = new Date(res.data.data.accessTokenExpiryDate)
        expiry.setMinutes(expiry.getMinutes() - 5)
        CJAdapter.tokenExpiry = expiry
        return CJAdapter.token!
      } finally {
        CJAdapter.tokenPromise = null
      }
    })()
    return CJAdapter.tokenPromise
  }

  // CJ hard-limits the whole account to 1 request/second (HTTP 429, code 1600200) — confirmed
  // by firing 5 parallel requests (exactly what checking 5 target markets at once does) and
  // seeing 4 of them rejected. This queue serializes every CJ call process-wide, regardless of
  // how many CJAdapter instances make them, so concurrent checks queue up instead of tripping
  // the limit and silently reading as "not available."
  private static requestChain: Promise<void> = Promise.resolve()
  private static lastRequestAt = 0
  private static readonly MIN_INTERVAL_MS = 1100

  private static throttle(): Promise<void> {
    const next = CJAdapter.requestChain.then(async () => {
      const wait = Math.max(0, CJAdapter.MIN_INTERVAL_MS - (Date.now() - CJAdapter.lastRequestAt))
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      CJAdapter.lastRequestAt = Date.now()
    })
    CJAdapter.requestChain = next.catch(() => {})
    return next
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, params?: object, body?: object): Promise<T> {
    const token = await this.getToken()
    for (let attempt = 0; attempt < 3; attempt++) {
      await CJAdapter.throttle()
      try {
        const res = await axios({ method, url: `${BASE}${path}`, headers: { 'CJ-Access-Token': token }, params, data: body })
        if (res.data.code !== 200) throw new Error(`CJ API error on ${path}: ${res.data.message}`)
        return res.data.data
      } catch (err: any) {
        // Retry on rate-limit even though we throttle — a concurrent request from another
        // process/user can still land in the same second and get rejected.
        const isRateLimit = err.response?.status === 429 || err.response?.data?.code === 1600200
        if (isRateLimit && attempt < 2) continue
        const msg = err.response?.data?.message ?? err.message
        throw new Error(`CJ API error on ${path}: ${msg}`)
      }
    }
    throw new Error(`CJ API error on ${path}: rate limited after retries`)
  }

  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const country = await this.getCountry()
    const data = await this.request<any>('GET', '/product/listV2', {
      keyWord: query,
      page,
      size: pageSize,
      countryCode: country,
    })

    // Response: data.content is array of groups, each with productList array
    const products: SupplierProduct[] = (data.content ?? [])
      .flatMap((group: any) => group.productList ?? [])
      .map((p: any) => ({
        supplierId: p.id,
        supplierName: 'cj',
        title: p.nameEn ?? p.productNameEn ?? '',
        description: '',
        images: p.bigImage ? [p.bigImage] : [],
        variants: [],
        categoryId: p.categoryId,
        categoryName: p.threeCategoryName ?? p.twoCategoryName ?? p.oneCategoryName ?? '',
        weight: undefined,
      }))

    return { products, total: data.totalRecords ?? products.length, page }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    const p = await this.request<any>('GET', '/product/query', { pid: supplierId, features: 'enable_inventory' })

    const images: string[] = Array.isArray(p.productImageSet)
      ? p.productImageSet
      : JSON.parse(p.productImage ?? '[]').filter(Boolean)

    // The description often embeds real, useful images (size charts, close-ups) inline —
    // pull them into the gallery so they aren't lost, and strip them from the text so they
    // aren't shown twice.
    const descriptionHtml: string = p.description ?? ''
    const processedDescriptionImages = await processDescriptionImages(extractDescriptionImages(descriptionHtml))
    for (const url of processedDescriptionImages) {
      if (!images.includes(url)) images.push(url)
    }

    const variants: SupplierVariant[] = (p.variants ?? []).map((v: any) => {
      let stock: number | undefined = undefined
      if (v.inventories && Array.isArray(v.inventories)) {
        stock = v.inventories.reduce((sum: number, inv: any) => sum + (inv.totalInventory ?? 0), 0)
      } else if (v.inventoryNum != null) {
        stock = v.inventoryNum
      }

      return {
        supplierId: v.vid,
        title: v.variantNameEn ?? v.variantKey ?? v.vid,
        options: this.parseOptions(v.variantKey ?? ''),
        costPrice: typeof v.variantSellPrice === 'number' ? v.variantSellPrice : parseFloat(v.variantSellPrice ?? '0'),
        imageUrl: v.variantImage ?? undefined,
        stock,
      }
    })

    const videoUrl = p.productVideo ?? p.videoUrl ?? undefined

    const { checked: _checked, ...delivery } = await this.fetchDeliveryEstimate(variants[0]?.supplierId)

    return {
      supplierId: p.pid,
      supplierName: 'cj',
      title: p.productNameEn ?? '',
      description: stripDescriptionImages(descriptionHtml),
      images,
      variants,
      videoUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      weight: p.productWeight,
      sellPoint: p.sellPoint,
      ...delivery,
    }
  }

  async checkMarketAvailability(_supplierId: string, countryCode: string, variantSupplierId?: string): Promise<MarketAvailability> {
    // CJ's freight endpoint requires a variant id — without one (e.g. previewing before any
    // variant is known) we can't check, so fail open rather than block.
    if (!variantSupplierId) return { available: true }
    const { checked, ...delivery } = await this.fetchDeliveryEstimate(variantSupplierId, countryCode)
    // A failed/errored check (rate limit, network blip, CJ downtime) is NOT the same as CJ
    // confirming there's no route — conflating them previously meant a rate-limited request
    // silently read as "doesn't ship here." Only a genuine, successful-but-empty response
    // counts as unavailable; anything we couldn't actually confirm fails open.
    if (!checked) return { available: true }
    return { available: delivery.deliveryMinDays != null, ...delivery }
  }

  // CJ's freightCalculate can return a dozen+ shipping methods for one route with wildly
  // different speeds. Both delivery-estimate display and actual order placement must agree
  // on which ONE method is "the" shipping method for this product — otherwise the estimate
  // shown to the customer (e.g. blending the fastest method's min with the slowest method's
  // max) can describe a shipment that will never actually happen.
  private pickLogisticOption(options: any[]): any | undefined {
    return options.find((o) => o.compositeRecommendSort === 0) ?? options[0]
  }

  private async fetchDeliveryEstimate(
    variantId?: string, countryOverride?: string
  ): Promise<{ deliveryMinDays?: number; deliveryMaxDays?: number; shippingCost?: number; checked: boolean }> {
    if (!variantId) return { checked: false }
    try {
      const country = countryOverride ?? await this.getCountry()

      const data = await this.request<any>('POST', '/logistic/freightCalculate', undefined, {
        startCountryCode: 'CN',
        endCountryCode: country,
        products: [{ vid: variantId, quantity: 1 }],
      })

      const allOptions: any[] = Array.isArray(data) ? data : []
      if (allOptions.length === 0) return { checked: true } // confirmed: no shipping route

      const selected = this.pickLogisticOption(allOptions)
      // logisticPrice is CJ's shipping fee for this method, in the same USD basis as
      // variantSellPrice — the real per-unit cost to fulfill, on top of the item price.
      const shippingCost = selected?.logisticPrice != null && !isNaN(Number(selected.logisticPrice))
        ? Number(selected.logisticPrice)
        : undefined

      const aging = String(selected?.logisticAging ?? '')
      const parts = aging.split('-').map(Number).filter((n) => !isNaN(n) && n > 0)
      if (parts.length === 0) return { shippingCost, checked: true }

      const minDays = parts[0]
      const maxDays = parts.length >= 2 ? parts[1] : parts[0]

      return {
        deliveryMinDays: minDays + CJ_PROCESSING_MIN_DAYS,
        deliveryMaxDays: maxDays + CJ_PROCESSING_MAX_DAYS,
        shippingCost,
        checked: true,
      }
    } catch {
      return { checked: false } // couldn't confirm — not the same as "no route"
    }
  }

  private async getBestLogistic(variantId?: string, countryCode?: string): Promise<string> {
    try {
      if (!variantId) return ''
      const data = await this.request<any>('POST', '/logistic/freightCalculate', undefined, {
        startCountryCode: 'CN',
        endCountryCode: countryCode ?? 'US',
        products: [{ vid: variantId, quantity: 1 }],
      })
      const options: any[] = Array.isArray(data) ? data : []
      return this.pickLogisticOption(options)?.logisticName ?? ''
    } catch {
      return ''
    }
  }

  async placeOrder(order: SupplierOrderRequest, sandbox = false): Promise<SupplierOrderResult> {
    const a = order.shippingAddress
    const fullName = `${a.firstName} ${a.lastName}`.trim()

    // Fetch best available shipping method
    const logisticName = await this.getBestLogistic(order.items[0]?.variantSupplierId, a.countryCode)

    const data = await this.request<any>('POST', '/shopping/order/createOrderV2', undefined, {
      orderNumber: order.ourOrderId,
      shippingCustomerName: fullName,
      shippingName: fullName,
      shippingCountry: a.countryCode,
      shippingCountryCode: a.countryCode,
      shippingZip: a.postalCode,
      shippingProvinceName: a.province ?? '',
      shippingAddress: a.address1,
      shippingAddress2: a.address2 ?? '',
      shippingPhone: a.phone ?? '',
      shippingCity: a.city,
      fromCountryCode: 'CN',
      logisticName,
      remark: order.remark ?? '',
      products: order.items.map((i) => ({ vid: i.variantSupplierId, quantity: i.quantity })),
      isSandbox: sandbox ? 1 : 0,
    })

    const orderId = data.orderId ?? order.ourOrderId

    // Confirm the order to move it from CREATED to UNPAID
    if (orderId && orderId !== order.ourOrderId) {
      try {
        const token = await this.getToken()
        await axios({ method: 'PATCH', url: `${BASE}/shopping/order/confirmOrder`, headers: { 'CJ-Access-Token': token }, data: { orderId } })
      } catch {
        // Non-fatal — order still created
      }
    }

    return { supplierOrderId: orderId, status: data.orderStatus ?? 'CREATED' }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const data = await this.request<any>('GET', '/shopping/order/getOrderDetail', { orderId: supplierOrderId })
    return {
      trackingNumber: data.trackNumber ?? undefined,
      trackingUrl: data.trackUrl ?? undefined,
      carrier: data.shippingName ?? undefined,
      status: data.orderStatus ?? 'UNKNOWN',
    }
  }

  async sandboxSimulatePay(orderId: string): Promise<boolean> {
    const data = await this.request<any>('POST', '/shopping/sandbox/simulatePay', undefined, { orderId })
    return data === true
  }

  async sandboxUpdateStatus(orderId: string, targetStatus: number): Promise<boolean> {
    const data = await this.request<any>('POST', '/shopping/sandbox/updateStatus', undefined, { orderId, targetStatus })
    return data === true
  }

  private parseOptions(variantKey: string): Record<string, string> {
    if (!variantKey) return {}
    // variantKey format: "Orange-Airpods1or2" or "Red-XL" — dash-separated values
    const parts = variantKey.split('-')
    if (parts.length === 1) return { Variant: parts[0] }
    if (parts.length === 2) return { Color: parts[0], Model: parts[1] }
    return { Variant: variantKey }
  }
}
