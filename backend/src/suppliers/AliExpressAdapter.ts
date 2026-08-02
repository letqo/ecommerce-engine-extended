import axios from 'axios'
import crypto from 'crypto'
import { env } from '../config/env'
import { prisma } from '../config/database'
import {
  SupplierAdapter, SupplierProduct, SupplierVariant,
  SupplierSearchResult, SupplierOrderRequest, SupplierOrderResult, SupplierTrackingInfo,
  MarketAvailability,
} from './types'
import { extractDescriptionImages, processDescriptionImages, stripDescriptionImages } from './extractDescriptionImages'

const BASE_URL = 'https://api-sg.aliexpress.com/sync'

export class AliExpressAdapter implements SupplierAdapter {
  readonly name = 'aliexpress'

  extractProductId(input: string): string {
    const m = input.match(/\/item\/(\d+)\.html/) ?? input.match(/item_id=(\d+)/) ?? input.match(/(\d{10,})/)
    return m ? m[1] : input.trim()
  }

  private sign(params: Record<string, string>): string {
    const secret = env.ALIEXPRESS_APP_SECRET
    const sorted = Object.keys(params).sort()
    const str = secret + sorted.map((k) => `${k}${params[k]}`).join('') + secret
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase()
  }

  private timestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  private storeId?: string

  withStore(storeId: string): this {
    this.storeId = storeId
    return this
  }

  private async getStoreSettings() {
    return this.storeId
      ? prisma.store.findUnique({
          where: { id: this.storeId },
          select: { aliexpressAccessToken: true, aliexpressTokenExpiry: true, shipToCountry: true, sourcingCurrency: true, targetMarkets: true },
        })
      : prisma.store.findFirst({
          select: { aliexpressAccessToken: true, aliexpressTokenExpiry: true, shipToCountry: true, sourcingCurrency: true, targetMarkets: true },
        })
  }

  private async getAccessToken(): Promise<string | null> {
    const store = await this.getStoreSettings()
    if (!store?.aliexpressAccessToken) return null
    if (store.aliexpressTokenExpiry && store.aliexpressTokenExpiry < new Date()) return null
    return store.aliexpressAccessToken
  }

  private async request<T>(method: string, extra: Record<string, string> = {}, requireAuth = false): Promise<T> {
    const params: Record<string, string> = {
      app_key: env.ALIEXPRESS_APP_KEY,
      sign_method: 'md5',
      timestamp: this.timestamp(),
      method,
      ...extra,
    }

    if (requireAuth) {
      const token = await this.getAccessToken()
      if (!token) throw new Error('AliExpress account not connected. Click "Connect Account" in the import page.')
      params.access_token = token
    }

    params.sign = this.sign(params)

    const body = new URLSearchParams(params).toString()
    const res = await axios.post(BASE_URL, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    // AliExpress wraps responses — try the method-derived key, then known aliases
    const key = method.replace(/\./g, '_') + '_response'
    const aliasKeys: Record<string, string> = {
      'aliexpress.ds.order.create': 'aliexpress_trade_buy_placeorder_response',
    }
    const data = res.data[key] ?? res.data[aliasKeys[method] ?? ''] ?? res.data
    if (data.code && data.code !== '0' && data.code !== '00' && data.code !== 200) {
      throw new Error(`AliExpress error [${data.code}]: ${data.msg ?? data.message ?? 'Unknown error'}`)
    }

    return data as T
  }

  async searchProducts(query: string, page = 1, pageSize = 20): Promise<SupplierSearchResult> {
    const store = await this.getStoreSettings()
    const currency = store?.sourcingCurrency ?? 'USD'

    const data = await this.request<any>('aliexpress.ds.text.search', {
      keyWord: query,
      pageIndex: String(page),
      pageSize: String(pageSize),
      local: 'en_US',
      currency,
      countryCode: 'US',
    }, true)

    const inner = data.data ?? data
    const list: any[] = inner.products?.selection_search_product ?? inner.products ?? []
    const total: number = inner.totalCount ?? list.length

    const products: SupplierProduct[] = list.map((p: any) => ({
      supplierId: String(p.itemId),
      supplierName: 'aliexpress',
      title: p.title ?? '',
      description: '',
      images: p.itemMainPic ? [p.itemMainPic] : [],
      variants: [{
        supplierId: String(p.itemId),
        title: 'Default',
        options: {},
        costPrice: parseFloat(p.salePrice ?? p.originalPrice ?? '0'),
        stock: undefined,
      }],
      categoryId: String(p.cateId ?? ''),
      categoryName: '',
    }))

    return { products, total, page }
  }

  async getProduct(supplierId: string): Promise<SupplierProduct> {
    // supplierId can be a full URL or a numeric product ID
    const productId = this.extractProductId(supplierId)
    const store = await this.getStoreSettings()
    const shipTo = store?.shipToCountry ?? 'US'
    const currency = store?.sourcingCurrency ?? 'USD'
    const targetMarkets = store?.targetMarkets ?? []

    // AliExpress can return an HTTP-200 "success" response whose product-info block is
    // empty for a given ship-to country when that specific listing has no shipping route
    // there — not a real error. Try the store's primary country first, then fall back
    // through the configured target markets, so a listing that just doesn't ship to the
    // primary country doesn't silently turn into a blank product.
    const candidates = [shipTo, ...targetMarkets.filter((c) => c !== shipTo)]
    let p: any
    let resolvedShipTo = shipTo
    let base: any = {}
    for (const country of candidates) {
      const data = await this.request<any>('aliexpress.ds.product.get', {
        product_id: productId,
        ship_to_country: country,
        currency,
        language: 'en_US',
      }, true)
      const candidateP = data.result ?? data
      if (!p) p = candidateP
      const candidateBase = candidateP.ae_item_base_info_dto ?? {}
      if (candidateBase.subject) {
        p = candidateP
        base = candidateBase
        resolvedShipTo = country
        break
      }
    }
    if (!base.subject) {
      throw new Error(`This listing has no usable data for any of your configured markets (${candidates.join(', ')}) — it may be delisted or region-locked entirely.`)
    }

    // Images — normalise protocol-relative URLs
    const fixUrl = (u: string) => (u.startsWith('//') ? `https:${u}` : u)
    const images: string[] = []
    const imageStr: string = p.ae_multimedia_info_dto?.image_urls ?? ''
    if (imageStr) {
      // AliExpress returns semicolon OR comma separated URLs
      const sep = imageStr.includes(';') ? ';' : ','
      images.push(...imageStr.split(sep).map((u: string) => fixUrl(u.trim())).filter(Boolean))
    }
    if (images.length === 0 && p.image_url) images.push(fixUrl(p.image_url))
    if (images.length === 0 && p.ae_item_base_info_dto?.product_images) {
      images.push(fixUrl(p.ae_item_base_info_dto.product_images))
    }

    // The description often embeds real, useful images (size charts, close-ups) inline —
    // pull them into the gallery so they aren't lost, and strip them from the text so they
    // aren't shown twice.
    const descriptionHtml: string = base.detail ?? ''
    const processedDescriptionImages = await processDescriptionImages(extractDescriptionImages(descriptionHtml))
    for (const url of processedDescriptionImages) {
      if (!images.includes(url)) images.push(url)
    }

    // AliExpress sometimes returns a single object instead of an array
    const ensureArray = (v: any): any[] => {
      if (!v) return []
      return Array.isArray(v) ? v : [v]
    }

    // Variants from SKU list
    const rawSkus = p.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o
    const skuList: any[] = ensureArray(rawSkus)

    const variants: SupplierVariant[] = skuList.map((sku: any, i: number) => {
      const options: Record<string, string> = {}
      const rawProps = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o
      const props: any[] = ensureArray(rawProps)
      for (const prop of props) {
        const key = prop.sku_property_name ?? 'Option'
        const val = prop.property_value_definition_name ?? prop.sku_property_value ?? ''
        options[key] = val
      }
      const price = parseFloat(
        sku.offer_sale_price ?? sku.offer_bulk_sale_price ?? sku.sku_price ?? '0'
      )
      // Build sku_attr string needed for order placement: "propId:valueId#valueName;..."
      const skuAttr = props
        .filter((p) => p.sku_property_id != null && p.property_value_id != null)
        .map((p) => `${p.sku_property_id}:${p.property_value_id}#${p.property_value_definition_name ?? p.sku_property_value ?? ''}`)
        .join(';')

      return {
        supplierId: String(sku.sku_id ?? i),
        title: Object.values(options).join(' / ') || `Variant ${i + 1}`,
        options,
        costPrice: price,
        imageUrl: sku.sku_image ? fixUrl(sku.sku_image) : undefined,
        stock: sku.sku_available_stock != null ? Number(sku.sku_available_stock)
          : sku.s_k_u_available_stock != null ? Number(sku.s_k_u_available_stock)
          : sku.ipm_sku_stock != null ? Number(sku.ipm_sku_stock)
          : undefined,
        skuAttr: skuAttr || undefined,
      }
    })

    // If no SKUs at all, build one default variant from base price
    if (variants.length === 0) {
      const base = p.ae_item_base_info_dto ?? {}
      const fallbackPrice = parseFloat(base.min_activity_amount?.amount ?? base.original_price ?? '0')
      variants.push({
        supplierId: productId,
        title: 'Default',
        options: {},
        costPrice: fallbackPrice,
        stock: undefined,
      })
    }

    const videoUrl = p.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0]?.media_url
      ?? p.ae_multimedia_info_dto?.video_url
      ?? undefined

    const inStockSku = skuList.find((s: any) =>
      Number(s.sku_available_stock ?? s.s_k_u_available_stock ?? s.ipm_sku_stock ?? 0) > 0
    ) ?? skuList[0]
    const firstSkuId = inStockSku?.sku_id ? String(inStockSku.sku_id) : undefined
    let delivery = await this.fetchDeliveryEstimate(productId, resolvedShipTo, currency, firstSkuId)

    // Fallback: use delivery_time from the product response's logistics_info_dto
    if (!delivery.deliveryMinDays) {
      const logDays = p.logistics_info_dto?.delivery_time
      if (logDays && Number(logDays) > 0) {
        delivery = { ...delivery, deliveryMinDays: Number(logDays), deliveryMaxDays: Number(logDays) }
      }
    }

    return {
      supplierId,
      supplierName: 'aliexpress',
      title: base.subject ?? '',
      description: stripDescriptionImages(descriptionHtml),
      images,
      variants,
      videoUrl: videoUrl ? fixUrl(videoUrl) : undefined,
      categoryId: String(base.first_level_category_id ?? ''),
      categoryName: base.first_level_category_name ?? '',
      weight: base.gross_weight ? parseFloat(base.gross_weight) : undefined,
      ...delivery,
    }
  }

  async checkMarketAvailability(supplierId: string, countryCode: string, variantSupplierId?: string): Promise<MarketAvailability> {
    const productId = this.extractProductId(supplierId)
    const store = await this.getStoreSettings()
    const currency = store?.sourcingCurrency ?? 'USD'
    const delivery = await this.fetchDeliveryEstimate(productId, countryCode, currency, variantSupplierId)
    return { available: delivery.deliveryMinDays != null, ...delivery }
  }

  private async fetchDeliveryEstimate(
    productId: string, shipTo: string, currency: string, skuId?: string
  ): Promise<{ deliveryMinDays?: number; deliveryMaxDays?: number; shippingCost?: number }> {
    try {
      const dto: Record<string, any> = {
        shipToCountry: shipTo,
        productId: Number(productId),
        productNum: 1,
        quantity: 1,
        sendGoodsCountryCode: 'CN',
        currency,
        locale: 'en_US',
        language: 'en_US',
      }
      if (skuId) dto.selectedSkuId = skuId

      const data = await this.request<any>('aliexpress.ds.freight.query', {
        queryDeliveryReq: JSON.stringify(dto),
      }, true)

      const result = data.result ?? data
      const rawOptions = result?.delivery_options?.delivery_option_d_t_o
      const options: any[] = Array.isArray(rawOptions) ? rawOptions : rawOptions ? [rawOptions] : []

      if (options.length === 0) return {}

      // AliExpress's freight.query returns exactly one option for most (typically small/light)
      // products, but bigger/heavier ones can return several genuinely different shipping
      // methods (confirmed live: a large RC aircraft returned 5, ranging 9-60 days) — mixing
      // the fastest method's day-count with a slower method's, or vice versa, produces a
      // nonsensical blended range, the same bug found and fixed for CJ. Unlike CJ, AliExpress's
      // placeOrder doesn't let us specify (or predict) which method it'll actually use for
      // fulfillment, so we consistently use its first-listed method — normally its standard
      // free shipping — for both the day-count range and the cost, never blended across options.
      const primary = options[0]
      const minDays = Number(primary.min_delivery_days)
      const maxDays = Number(primary.max_delivery_days)
      // A missing shipping_fee_cent means this method is free (see free_shipping: true on the
      // option), not "unknown" — treating it as unknown silently drops shipping cost from the
      // landed-cost calculation instead of correctly recording it as €0.
      const shippingCost = primary.shipping_fee_cent != null && !isNaN(Number(primary.shipping_fee_cent))
        ? Number(primary.shipping_fee_cent)
        : primary.free_shipping ? 0 : undefined

      if (isNaN(minDays) || minDays <= 0) return { shippingCost }
      return { deliveryMinDays: minDays, deliveryMaxDays: !isNaN(maxDays) && maxDays > 0 ? maxDays : minDays, shippingCost }
    } catch {
      return {}
    }
  }

  async placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const a = order.shippingAddress

    const productItems = order.items.map((item) => {
      const [productId, skuAttr] = item.variantSupplierId.split(':::')
      const entry: Record<string, unknown> = {
        product_id: Number(productId),
        product_count: item.quantity,
      }
      if (skuAttr) entry.sku_attr = skuAttr
      return entry
    })

    const requestBody = {
      product_items: productItems,
      logistics_address: {
        contact_person: `${a.firstName} ${a.lastName}`.trim(),
        full_name: `${a.firstName} ${a.lastName}`.trim(),
        address: a.address1,
        address2: a.address2 || '',
        city: a.city,
        province: a.province || '',
        country: a.countryCode,
        zip: a.postalCode,
        mobile_no: a.phone || '',
        locale: 'en_US',
      },
    }

    const data = await this.request<any>('aliexpress.ds.order.create', {
      param_place_order_request4_open_api_d_t_o: JSON.stringify(requestBody),
    }, true)

    const result = data.result ?? data
    if (result.is_success === false) {
      throw new Error(`AliExpress order failed: ${result.error_message ?? JSON.stringify(result)}`)
    }

    const orderList = result.order_list
    const orderId = Array.isArray(orderList) ? orderList[0]
      : orderList?.number?.[0]
      ?? result.order_id
    if (!orderId) throw new Error('AliExpress did not return an order ID — check your DS app approval status')

    return { supplierOrderId: String(orderId), status: 'CREATED' }
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo> {
    const data = await this.request<any>('aliexpress.trade.ds.order.get', {
      order_id: supplierOrderId,
    }, true)

    const orderData = data.result ?? data
    const status = orderData.order_status ?? 'UNKNOWN'

    // logistics_info_list can be a direct array or wrapped in ae_order_logistics_info
    const rawList = orderData.logistics_info_list
    let logisticsList: any[]
    if (Array.isArray(rawList)) {
      logisticsList = rawList
    } else if (rawList?.ae_order_logistics_info) {
      const inner = rawList.ae_order_logistics_info
      logisticsList = Array.isArray(inner) ? inner : [inner]
    } else {
      logisticsList = []
    }
    const logistics = logisticsList[0]

    return {
      trackingNumber: logistics?.logistics_no ?? undefined,
      trackingUrl: undefined,
      carrier: logistics?.logistics_service ?? undefined,
      status,
    }
  }

  async getTrackingDetails(trackingNumber: string, serviceName: string, orderId: string): Promise<SupplierTrackingInfo> {
    try {
      const data = await this.request<any>('aliexpress.logistics.ds.trackinginfo.query', {
        logistics_no: trackingNumber,
        origin: 'CN',
        out_ref: orderId,
        service_name: serviceName,
        to_area: 'US',
      }, true)

      const result = data.result ?? data
      const rawDetails = result?.details
      const detailList: any[] = Array.isArray(rawDetails) ? rawDetails
        : rawDetails?.detail_list ? (Array.isArray(rawDetails.detail_list) ? rawDetails.detail_list : [rawDetails.detail_list])
        : []
      const latest = detailList[detailList.length - 1]

      return {
        trackingNumber,
        trackingUrl: undefined,
        carrier: serviceName,
        status: latest?.status ?? 'IN_TRANSIT',
      }
    } catch {
      return { trackingNumber, status: 'UNKNOWN' }
    }
  }
}
