export interface SupplierProduct {
  supplierId: string
  supplierName: string
  title: string
  description: string
  images: string[]
  variants: SupplierVariant[]
  categoryId?: string
  categoryName?: string
  videoUrl?: string
  weight?: number
  sellPoint?: string
  deliveryMinDays?: number
  deliveryMaxDays?: number
  // Estimated per-unit shipping fee to fulfill via this supplier, in the same currency as
  // each variant's costPrice. This is what the supplier charges YOU to ship the order — not
  // what the customer pays at checkout. Omitted when the supplier couldn't quote it.
  shippingCost?: number
}

export interface SupplierVariant {
  supplierId: string
  title: string
  options: Record<string, string>
  costPrice: number
  imageUrl?: string
  stock?: number
  skuAttr?: string
}

export interface SupplierOrderRequest {
  ourOrderId: string
  items: { variantSupplierId: string; quantity: number }[]
  shippingAddress: {
    firstName: string
    lastName: string
    address1: string
    address2?: string
    city: string
    province?: string
    postalCode: string
    countryCode: string
    phone?: string
  }
  remark?: string
}

export interface SupplierOrderResult {
  supplierOrderId: string
  status: string
}

export interface SupplierTrackingInfo {
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  status: string
}

export interface SupplierSearchResult {
  products: SupplierProduct[]
  total: number
  page: number
}

export interface MarketAvailability {
  available: boolean
  deliveryMinDays?: number
  deliveryMaxDays?: number
  shippingCost?: number
}

export interface SupplierAdapter {
  readonly name: string
  searchProducts(query: string, page?: number, pageSize?: number): Promise<SupplierSearchResult>
  getProduct(supplierId: string): Promise<SupplierProduct>
  placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult>
  getOrderStatus(supplierOrderId: string): Promise<SupplierTrackingInfo>
  // Checks whether a specific listing can actually ship to `countryCode`, independent of
  // the store's default shipToCountry. Used both for the import-preview coverage table and
  // the checkout-time recheck against a customer's real shipping address.
  checkMarketAvailability(supplierId: string, countryCode: string, variantSupplierId?: string): Promise<MarketAvailability>
}
