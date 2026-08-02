import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { prisma } from '../config/database'
import { createAdapter } from '../suppliers/registry'
import { updateStore, createStore } from '../routes/admin/store'
import { createCategory, updateCategory } from '../routes/admin/categories'
import { importSupplierProduct } from '../routes/admin/supplier'
import { createTheme, saveThemeTranslation } from '../routes/admin/themes'
import { updateProduct, setProductStatus } from '../routes/admin/products'
import { createDiscount, updateDiscount } from '../routes/admin/discounts'
import { moderateReview } from '../routes/admin/reviews'
import { createBlogPost, updateBlogPost, setBlogPostPublished } from '../routes/admin/blog'
import { createShippingZone, createShippingRate } from '../routes/admin/shipping'
import { addOrderNote } from '../routes/admin/orders'
import { fulfillSupplierOrderManually } from './supplierOrderFulfillment'
import { generateStoreContent, StoreContentField, enhanceProduct, translateProductContent, translateCategoryContent, translateStoreContent, translateThemeStrings } from './aiEnhance'
import { generateFromPromptAndUpload } from './imageStudio'
import { extractThemeStrings } from '../lib/themeText'
import { Locale } from '../lib/locales'
import { getStoreHealth } from './storeHealth'
import { MarketAvailability } from '../suppliers/types'
import { computeMarketDeviation, buildDeliveryNote } from '../suppliers/marketDeviation'

const MODEL = 'claude-sonnet-5'
const MAX_TURNS = 8
const ASSISTANT_ACTOR = 'Setup Assistant'

export interface AssistantAction {
  tool: string
  summary: string
  pendingConfirm?: {
    method: 'PUT' | 'PATCH' | 'POST' | 'DELETE'
    path: string
    body?: any
    label: string
    description: string
  }
}

// ── Tool schemas ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // Store settings & content
  {
    name: 'get_store_settings',
    description: 'Read the store\'s current settings — name, description, currency, brand colors, contact info, sourcing country, announcement banner, and homepage hero section. Use this before answering questions about current settings or diagnosing why something on the storefront looks wrong, rather than guessing.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_store_settings',
    description: 'Update the store\'s name, description, currency, brand colors, contact info, sourcing country, announcement banner, or homepage hero section. Only pass the fields that should change.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        currency: { type: 'string', description: '3-letter ISO code, e.g. USD, EUR' },
        currencySymbol: { type: 'string' },
        primaryColor: { type: 'string', description: 'Hex color, e.g. #111827' },
        secondaryColor: { type: 'string' },
        accentColor: { type: 'string' },
        contactEmail: { type: 'string' },
        contactPhone: { type: 'string' },
        address: { type: 'string' },
        shipToCountry: { type: 'string', description: '2-letter ISO country code the store primarily ships TO (its target market) — used by CJ/AliExpress to look up accurate prices, stock, and delivery times for that destination. Not where products are sourced from (CJ/AliExpress dropshipping always ships from China, which is handled automatically).' },
        sourcingCurrency: { type: 'string' },
        metaTitle: { type: 'string' },
        metaDescription: { type: 'string' },
        announcementActive: { type: 'boolean', description: 'Show or hide the announcement banner.' },
        announcementText: { type: 'string' },
        announcementLink: { type: 'string' },
        heroHeadline: { type: 'string' },
        heroSubtext: { type: 'string' },
        heroCtaText: { type: 'string' },
        heroCtaLink: { type: 'string' },
        heroBannerUrl: { type: 'string', description: 'Homepage hero banner image URL. Use generate_image or ask the user to upload one via Settings if they don\'t have a URL.' },
      },
    },
  },
  {
    name: 'generate_store_content',
    description: 'Generate and save one of the store\'s long-form pages (About Us, shipping policy, return policy, privacy policy, terms of service, or FAQ) using AI, based on the store\'s current name/description.',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent'] },
      },
      required: ['field'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an image with AI and apply it directly as the store logo, favicon, a category\'s image, or a blog post\'s cover image. Only use this if the user wants an AI-generated image rather than uploading their own via Settings.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['logo', 'favicon', 'category', 'blogCover'] },
        prompt: { type: 'string', description: 'Description of the image to generate.' },
        categorySlug: { type: 'string', description: 'Required when target is "category" — the slug of the category to update.' },
        postId: { type: 'string', description: 'Required when target is "blogCover" — the blog post to set the cover image on.' },
      },
      required: ['target', 'prompt'],
    },
  },
  {
    name: 'create_store',
    description: 'Create an additional store (multi-store setups only). Rarely needed — most conversations operate on the store already in context.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        currency: { type: 'string' },
        shipToCountry: { type: 'string', description: 'The store\'s target market / ship-to country, not where products are sourced from.' },
      },
      required: ['name'],
    },
  },

  // Theme
  {
    name: 'select_or_create_theme',
    description: 'Propose activating one of the store\'s built-in themes (default, elegant, bold), optionally cloned with custom brand colors. This only PROPOSES the change — it does not go live until the user clicks the confirm button, so it is safe to call freely.',
    input_schema: {
      type: 'object',
      properties: {
        baseSlug: { type: 'string', enum: ['default', 'elegant', 'bold'] },
        primaryColor: { type: 'string', description: 'Optional hex override' },
        accentColor: { type: 'string', description: 'Optional hex override' },
        name: { type: 'string', description: 'Name for the cloned theme, if colors were overridden' },
      },
      required: ['baseSlug'],
    },
  },

  // Categories
  {
    name: 'create_category',
    description: 'Create a product category for the store.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'update_category',
    description: 'Edit an existing category\'s name, description, visibility, or sort order.',
    input_schema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        isVisible: { type: 'boolean' },
        sortOrder: { type: 'number' },
      },
      required: ['categoryId'],
    },
  },
  {
    name: 'delete_category',
    description: 'Delete a category. This only proposes the deletion — it requires the user to confirm.',
    input_schema: {
      type: 'object',
      properties: { categoryId: { type: 'string' } },
      required: ['categoryId'],
    },
  },

  // Products
  {
    name: 'search_supplier_products',
    description: 'Search a connected supplier\'s catalog by keyword when the user describes a niche rather than pasting a specific product link. Requires the store\'s sourcing country to already be set.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        supplier: { type: 'string', enum: ['cj', 'aliexpress'], description: 'Defaults to cj if unset.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'import_supplier_product',
    description: 'Resolve a CJ or AliExpress product link (or raw product ID) the user pasted, and import it into the store as a draft product. Never import more than one or two products without checking with the user first. The price and costPerItem are automatically based on landed cost (item cost + estimated supplier shipping fee), not just the item price — the result includes marketAvailability (pass/fail per configured target market, from Settings), marketDeviationWarnings (flags when delivery time or shipping cost swings wildly between target markets, e.g. 9 days to one country but 50 to another — a sign of uneven logistics coverage worth mentioning even if every market technically ships), deliveryNote (a persisted, plain-language flag saved on the product itself — same info as marketDeviationWarnings plus a check for delivery that\'s just slow everywhere, e.g. "Slow delivery: ~60 days" — null when nothing is noteworthy), and landedCostPerUnit — always mention any markets it does NOT ship to and any deviation/delivery warnings, so the owner knows before they publish it.',
    input_schema: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'The product URL or ID the user provided.' },
        supplier: { type: 'string', enum: ['cj', 'aliexpress'], description: 'Defaults to cj if unset.' },
        markup: { type: 'number', description: 'Price multiplier over supplier cost. If omitted, falls back to the store\'s configured defaultImportMarkup (see get_store_settings) — only pass this if the owner asked for a different multiplier on this specific import.' },
        categorySlug: { type: 'string', description: 'Slug of an existing store category to file this product under, if one clearly fits. Leave unset if unsure — the user can assign it later.' },
      },
      required: ['link'],
    },
  },
  {
    name: 'list_products',
    description: 'List the store\'s products (id, title, status, category, syncAlert, totalInventory, isSupplierLinked, unavailableMarkets, deliveryNote, createdAt). "status" and stock are two SEPARATE things a product can be wrong about — a DRAFT product is hidden from the storefront regardless of stock, and an ACTIVE product with totalInventory 0 shows as out-of-stock regardless of status; when diagnosing why a product "looks out of stock" or missing, always check both, don\'t assume one explains it. For supplier-linked products (isSupplierLinked), inventory/price/delivery data is only a snapshot taken at import time — it is NOT live and is only refreshed once a day by the automatic supplier sync, so a just-imported product\'s stock can already be stale/wrong until the next sync runs; if numbers look suspicious, say so rather than asserting they\'re current. unavailableMarkets lists target markets (from Settings) this listing did not ship to at import time — also a snapshot, not rechecked automatically. deliveryNote is a persisted plain-language flag from import time for unusually slow delivery or a big swing between markets (null if nothing noteworthy) — also a snapshot. syncAlert surfaces automatic warnings from the daily supplier sync — most importantly "supplier landed cost exceeds your price" (item cost + shipping now costs more than you sell it for, meaning it\'s losing money on every sale). Pass includePricing to also get each variant\'s id, price, costPerItem (landed cost), and inventoryQty — needed before calling update_product to reprice something. Use this to find a product\'s id before editing/deleting it, to check which products still need a category, to find and fix underpriced/loss-making products, or to check why something isn\'t showing/selling on the storefront.',
    input_schema: {
      type: 'object',
      properties: {
        onlyUncategorized: { type: 'boolean', description: 'If true, only return products with no category assigned.' },
        includePricing: { type: 'boolean', description: 'If true, include each variant\'s id, price, costPerItem (landed cost incl. shipping), and inventoryQty — required before repricing via update_product.' },
      },
    },
  },
  {
    name: 'assign_product_category',
    description: 'Assign an existing product to a category — use this to fix products that were imported without one.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' }, categorySlug: { type: 'string' } },
      required: ['productId', 'categorySlug'],
    },
  },
  {
    name: 'update_product',
    description: 'Edit an existing product\'s title, description, price/variants, tags, vendor, category, SEO fields, or featured flag. Only pass what should change; omit variants entirely to leave pricing untouched.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        shortDescription: { type: 'string' },
        categoryId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        vendor: { type: 'string' },
        isFeatured: { type: 'boolean' },
        metaTitle: { type: 'string' },
        metaDescription: { type: 'string' },
        videoUrl: { type: 'string', description: 'Product video URL (e.g. from the supplier listing, or pasted by the owner). Pass an empty string to remove it.' },
        variants: {
          type: 'array',
          description: 'Only include if changing prices/inventory. Each item MUST include the existing variant id (from list_products or get context) plus every field on it — this replaces each variant\'s full record.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              price: { type: 'number' },
              compareAtPrice: { type: 'number' },
              inventoryQty: { type: 'number' },
              options: { type: 'object' },
            },
            required: ['id', 'title', 'price'],
          },
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'set_product_status',
    description: 'Change a product\'s status: DRAFT (hidden), ACTIVE (visible on the storefront), or ARCHIVED.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' }, status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] } },
      required: ['productId', 'status'],
    },
  },
  {
    name: 'enhance_product_ai',
    description: 'Use AI to rewrite a product\'s description, short description, vendor, SEO meta, tags, and variant option names from its raw supplier data, then apply the result directly.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'delete_product',
    description: 'Delete a product. This only proposes the deletion — it requires the user to confirm. Products with active orders cannot be deleted (archive them instead).',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },

  // Discounts
  {
    name: 'create_discount',
    description: 'Create a discount code.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] },
        value: { type: 'number', description: 'Percentage (0-100) or fixed amount, depending on type. Ignored for FREE_SHIPPING.' },
        minOrderAmount: { type: 'number' },
        maxUses: { type: 'number' },
        isActive: { type: 'boolean' },
      },
      required: ['code', 'type', 'value'],
    },
  },
  {
    name: 'update_discount',
    description: 'Edit an existing discount code, or toggle it active/inactive.',
    input_schema: {
      type: 'object',
      properties: {
        discountId: { type: 'string' },
        value: { type: 'number' },
        minOrderAmount: { type: 'number' },
        maxUses: { type: 'number' },
        isActive: { type: 'boolean' },
      },
      required: ['discountId'],
    },
  },
  {
    name: 'delete_discount',
    description: 'Delete a discount code. This only proposes the deletion — it requires the user to confirm.',
    input_schema: {
      type: 'object',
      properties: { discountId: { type: 'string' } },
      required: ['discountId'],
    },
  },

  // Reviews
  {
    name: 'moderate_review',
    description: 'Approve or reject a pending customer review.',
    input_schema: {
      type: 'object',
      properties: { reviewId: { type: 'string' }, status: { type: 'string', enum: ['APPROVED', 'REJECTED'] } },
      required: ['reviewId', 'status'],
    },
  },
  {
    name: 'delete_review',
    description: 'Delete a review. This only proposes the deletion — it requires the user to confirm.',
    input_schema: {
      type: 'object',
      properties: { reviewId: { type: 'string' } },
      required: ['reviewId'],
    },
  },

  // Blog
  {
    name: 'create_blog_post',
    description: 'Create a blog post as a draft.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: 'HTML or plain text body.' },
        excerpt: { type: 'string' },
        coverImage: { type: 'string', description: 'Cover image URL — use generate_image with target "blogCover" first if the user wants one AI-generated.' },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_blog_post',
    description: 'Edit an existing blog post.',
    input_schema: {
      type: 'object',
      properties: {
        postId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        excerpt: { type: 'string' },
        coverImage: { type: 'string', description: 'Cover image URL — use generate_image with target "blogCover" first if the user wants one AI-generated.' },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['postId'],
    },
  },
  {
    name: 'publish_blog_post',
    description: 'Publish a draft blog post, making it live on the storefront.',
    input_schema: { type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] },
  },
  {
    name: 'unpublish_blog_post',
    description: 'Unpublish a blog post, reverting it to draft.',
    input_schema: { type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] },
  },
  {
    name: 'delete_blog_post',
    description: 'Delete a blog post. This only proposes the deletion — it requires the user to confirm.',
    input_schema: { type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] },
  },

  // Translations — English lives in the base fields already, so targetLocale
  // never includes "en". Each tool generates AND saves the translation in one
  // step, same immediate-apply pattern as generate_store_content.
  {
    name: 'translate_product',
    description: 'Translate a product\'s title, descriptions, and SEO fields into another language and save it as that product\'s translation for that locale. Overwrites any existing translation for that locale only — other locales are untouched.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        targetLocale: { type: 'string', enum: ['fr', 'de', 'it', 'es'] },
      },
      required: ['productId', 'targetLocale'],
    },
  },
  {
    name: 'translate_category',
    description: 'Translate a category\'s name and description into another language and save it as that category\'s translation for that locale.',
    input_schema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        targetLocale: { type: 'string', enum: ['fr', 'de', 'it', 'es'] },
      },
      required: ['categoryId', 'targetLocale'],
    },
  },
  {
    name: 'translate_store_content',
    description: 'Translate the store\'s About Us page and/or policy pages (whichever currently have content) into another language and save them. Pass fields to translate only specific pages, or omit it to translate everything that has content.',
    input_schema: {
      type: 'object',
      properties: {
        targetLocale: { type: 'string', enum: ['fr', 'de', 'it', 'es'] },
        fields: {
          type: 'array',
          items: { type: 'string', enum: ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent'] },
          description: 'Optional — restrict translation to specific pages. Omit to translate every page that currently has content.',
        },
      },
      required: ['targetLocale'],
    },
  },
  {
    name: 'translate_theme',
    description: 'Translate a theme\'s UI text (nav labels, section headings, banner text, testimonials, etc.) into another language and save it. Only affects text already in the theme\'s current layout — add sections/text first, then translate.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The theme\'s slug — see availableThemes in the store context.' },
        targetLocale: { type: 'string', enum: ['fr', 'de', 'it', 'es'] },
      },
      required: ['slug', 'targetLocale'],
    },
  },

  // Subscribers
  {
    name: 'list_subscribers',
    description: 'List email subscribers.',
    input_schema: {
      type: 'object',
      properties: { onlyActive: { type: 'boolean' } },
    },
  },
  {
    name: 'delete_subscriber',
    description: 'Permanently remove a subscriber\'s email address. This only proposes the deletion — it requires the user to confirm, since there is no undo.',
    input_schema: { type: 'object', properties: { subscriberId: { type: 'string' } }, required: ['subscriberId'] },
  },

  // Shipping
  {
    name: 'create_shipping_zone',
    description: 'Create a shipping zone covering a set of countries.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, countries: { type: 'array', items: { type: 'string' }, description: '2-letter ISO country codes' } },
      required: ['name', 'countries'],
    },
  },
  {
    name: 'create_shipping_rate',
    description: 'Add a shipping rate to a zone. Double-check the price makes sense before creating — this affects real checkout pricing immediately.',
    input_schema: {
      type: 'object',
      properties: {
        zoneId: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
        isFree: { type: 'boolean' },
        minOrderAmount: { type: 'number' },
        estimatedDays: { type: 'string' },
      },
      required: ['zoneId', 'name', 'price'],
    },
  },
  {
    name: 'delete_shipping_rate',
    description: 'Delete a shipping rate. This only proposes the deletion — it requires the user to confirm.',
    input_schema: { type: 'object', properties: { rateId: { type: 'string' } }, required: ['rateId'] },
  },

  // Orders (read-only + safe actions immediate; money/cancellation staged)
  {
    name: 'list_orders',
    description: 'List orders, optionally filtered by status or a search term (order number or customer email).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get full detail on one order, including items, timeline, and refund history.',
    input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  {
    name: 'fulfill_order',
    description: 'Mark one parcel of an order shipped by attaching a tracking number (an order can ship as more than one parcel — use get_order to find the right supplierOrderId). Sends the customer their shipping notification for that parcel.',
    input_schema: {
      type: 'object',
      properties: { supplierOrderId: { type: 'string' }, trackingNumber: { type: 'string' }, trackingUrl: { type: 'string' } },
      required: ['supplierOrderId', 'trackingNumber'],
    },
  },
  {
    name: 'add_order_note',
    description: 'Add a freeform internal note to an order\'s timeline.',
    input_schema: {
      type: 'object',
      properties: { orderId: { type: 'string' }, message: { type: 'string' } },
      required: ['orderId', 'message'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order. This only proposes the cancellation — it requires the user to confirm, since it\'s customer-facing and cannot be undone through this tool. Cannot cancel an order that has already shipped.',
    input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  {
    name: 'list_pending_fulfillments',
    description: 'List parcels across ALL orders that need fulfillment attention right now — AWAITING_MANUAL (no ordering API, needs tracking entered by hand) or ERROR (a CJ/AliExpress submission failed). This is the cross-order fulfillment queue, oldest first — use it when the owner asks "what needs shipping" or "what\'s stuck," rather than checking orders one at a time with get_order.',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['AWAITING_MANUAL', 'ERROR'], description: 'Omit to get both.' } },
    },
  },
  {
    name: 'get_fulfillment_details',
    description: 'Get full detail on one parcel (SupplierOrder) — items, shipping address, status, error history, retry attempts. Use this after list_pending_fulfillments to get everything needed to act on a specific parcel (e.g. before calling fulfill_order or fulfill_order_with_supplier).',
    input_schema: { type: 'object', properties: { supplierOrderId: { type: 'string' } }, required: ['supplierOrderId'] },
  },
  {
    name: 'fulfill_order_with_supplier',
    description: 'Place a real, paid order with CJ or AliExpress to fulfill this order\'s items. This spends real money with the supplier. This only proposes the action — it requires the user to confirm.',
    input_schema: {
      type: 'object',
      properties: { orderId: { type: 'string' }, supplier: { type: 'string', enum: ['cj', 'aliexpress'] } },
      required: ['orderId', 'supplier'],
    },
  },
  {
    name: 'refund_order',
    description: 'Refund an order via Stripe. This moves real money back to the customer. This only proposes the refund — it requires the user to confirm.',
    input_schema: {
      type: 'object',
      properties: { orderId: { type: 'string' }, amount: { type: 'number' }, reason: { type: 'string' } },
      required: ['orderId', 'amount'],
    },
  },

  // Customers (read-only — no edit/delete tools by design)
  {
    name: 'list_customers',
    description: 'List customers with basic contact info and order counts. Read-only — there is no tool to edit or delete customer records.',
    input_schema: { type: 'object', properties: { search: { type: 'string' } } },
  },
  {
    name: 'get_customer',
    description: 'Get a customer\'s detail — contact info, addresses, and order history. Read-only.',
    input_schema: { type: 'object', properties: { customerId: { type: 'string' } }, required: ['customerId'] },
  },

  // Store readiness / SEO health (read-only)
  {
    name: 'get_store_health',
    description: 'Get the store\'s readiness/SEO health report: overall 0-100 score, per-category breakdown (store SEO, product SEO, category content, site infrastructure, content completeness), and the specific failing checks with counts and affected item names. Use this to tell the merchant what to fix before launch.',
    input_schema: { type: 'object', properties: {} },
  },
]

// ── System prompt ────────────────────────────────────────────────────────

function systemPrompt(snapshot: string): string {
  return `You are a friendly, efficient setup assistant embedded in an e-commerce admin panel. The store owner is non-technical. Your job is to run the store's admin panel on their behalf by calling the tools available to you — you are a natural-language layer over the existing admin panel, not a general chatbot.

Current store state:
${snapshot}

Guidelines:
- Ask short, conversational clarifying questions before acting when something is genuinely ambiguous — don't interrogate with a long list up front.
- The store's sourcing country (which country supplier orders ship FROM) must be set before you search or import any supplier product — if it's missing, ask for it first via update_store_settings.
- Ask which supplier(s) the owner wants to use (CJ, AliExpress, or both) before searching or importing, defaulting to CJ if they don't have a preference.
- The user will often paste a product link directly — use import_supplier_product for that. Only use search_supplier_products when they describe a niche instead of giving you a link.
- Never import more than one or two products in a row without pausing to ask if you should continue.
- When the owner asks you to apply something across many items at once (e.g. "enhance all my products," "generate images for every category," "translate everything"), don't narrate or plan out the full remaining list in text before acting — that burns your response budget on talk instead of action and can cut you off before you've done anything. Just start calling tools one at a time; you'll automatically get to keep calling more tools in this same reply without the owner needing to say anything. You'll eventually be stopped and asked to wrap up — when that happens, briefly say what you finished and what's left, and the owner can just say "continue" to pick up where you left off.
- When importing a supplier product, pass categorySlug if one of the store's existing categories clearly fits. If none fit well, leave it unassigned rather than guessing, and say so.
- If asked to fix category assignments on products that already exist, use list_products to find them and assign_product_category to fix each — you don't need to ask them to do this manually.
- If asked to fix underpriced/loss-making products, call list_products with includePricing: true, and look at syncAlert for "supplier landed cost exceeds your price" warnings — costPerItem on each variant is already the true landed cost (item + estimated shipping), freshly corrected by the last sync. The current price on these was set before that correction, so you can't back out a "original markup" from it — ask the owner what markup multiple they want applied to costPerItem (check get_store_settings for defaultImportMarkup if you need the current default — it's editable, not fixed at 2.5x) unless they've already told you, then tell them the before/after price for each variant you change.
- The store's default import markup (defaultImportMarkup) is a real, editable setting via update_store_settings — if the owner asks to change the standing default markup for future imports, update that field directly rather than saying you can't. This is separate from a one-off markup on a single import_supplier_product call, which always overrides the default for that import only.
- If asked why a product "looks out of stock," is missing from the storefront, or isn't selling, always call list_products and check BOTH status and totalInventory — they're independent problems (DRAFT hides it regardless of stock; ACTIVE with 0 stock shows it as out-of-stock regardless of status) and a real diagnosis needs both, not just one. For supplier-linked products (isSupplierLinked), remember inventory/price/delivery numbers are a point-in-time snapshot from import, only refreshed once a day by the automatic sync — don't assert a recently-imported product's numbers are current; if they look suspicious, say so and suggest the owner click Sync in the admin panel (you have no tool to trigger this yourself) before drawing conclusions.
- After you call tools, briefly summarize in plain, friendly language what you just did — don't list raw JSON or field names.
- Some tools only PROPOSE an action rather than apply it — anything that deletes a record, cancels an order, places a paid supplier order, or issues a refund. When you call one of these, tell the user clearly that nothing has happened yet and they need to click confirm in the chat — never say "I've deleted X" or "I've refunded X" for a staged action, only "I've prepared X, click confirm to make it real."
- You have no ability to edit or delete customer records (email, name, phone, address) — this genuinely doesn't exist as a capability, not a restriction you're working around. If asked, say so plainly and suggest checking whether the admin panel has added this since.
- You can translate products, categories, store content pages, and theme UI text into French, German, Italian, or Spanish (translate_product, translate_category, translate_store_content, translate_theme). English is the base language and lives in the main fields already — never pass "en" as a targetLocale, and never translate something that has no English content yet (write it in English first). Each translate_* call generates AND saves the translation for that one locale in one step — it doesn't touch other locales. If the user wants a full storefront translated, translate the store content pages, then loop through their categories and products, then the active theme.
- When asked what needs shipping, what's stuck, or for a fulfillment status check, use list_pending_fulfillments (and get_fulfillment_details for one parcel) rather than paging through list_orders — it's the same cross-order queue the admin panel's Fulfillment Queue page shows. ERROR parcels for CJ/AliExpress retry automatically on a backoff schedule; only suggest fulfill_order_with_supplier for one that's stopped retrying (attempts exhausted) or ask the owner if they want to force it sooner.
- Stay within the tools you have. If asked for something outside this scope (e.g. writing marketing emails, changing code), say so plainly and suggest they do it elsewhere in the admin panel.`
}

async function storeSnapshot(storeId: string): Promise<string> {
  const [store, categories, themes] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, include: { translations: { select: { locale: true } } } }),
    prisma.category.findMany({ where: { storeId }, select: { name: true, slug: true } }),
    prisma.theme.findMany({ where: { storeId }, select: { slug: true, name: true, isBuiltIn: true } }),
  ])

  return JSON.stringify({
    name: store?.name,
    description: store?.description,
    currency: store?.currency,
    shipToCountry: store?.shipToCountry,
    activeTheme: store?.activeTheme,
    hasLogo: !!store?.logoUrl,
    hasFavicon: !!store?.faviconUrl,
    hasAboutUs: !!store?.aboutUs,
    storeContentTranslatedLocales: store?.translations?.map((t) => t.locale) ?? [],
    categories: categories.map((c) => c.name),
    availableThemes: themes.map((t) => ({ slug: t.slug, name: t.name, builtIn: t.isBuiltIn })),
  }, null, 2)
}

async function resolveSupplierId(supplier: string, storeId: string, link: string): Promise<string> {
  const adapter = createAdapter(supplier) as any
  if (adapter.withStore) adapter.withStore(storeId)
  if (typeof adapter.extractProductId === 'function') return adapter.extractProductId(link)
  return link.trim()
}

// ── Tool dispatch ────────────────────────────────────────────────────────

export async function runTool(storeId: string, name: string, input: any): Promise<{ result: unknown; action: AssistantAction }> {
  switch (name) {
    // Store
    case 'get_store_settings': {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: {
          name: true, description: true, currency: true, currencySymbol: true,
          primaryColor: true, secondaryColor: true, accentColor: true,
          contactEmail: true, contactPhone: true, address: true,
          shipToCountry: true, sourcingCurrency: true, defaultImportMarkup: true,
          metaTitle: true, metaDescription: true,
          announcementActive: true, announcementText: true, announcementLink: true,
          heroHeadline: true, heroSubtext: true, heroCtaText: true, heroCtaLink: true, heroBannerUrl: true,
          logoUrl: true, faviconUrl: true,
        },
      })
      if (!store) throw new Error('Store not found')
      return { result: { settings: store }, action: { tool: name, summary: 'Read current store settings' } }
    }

    case 'update_store_settings': {
      await updateStore(storeId, input)
      return { result: { ok: true }, action: { tool: name, summary: `Updated store settings: ${Object.keys(input).join(', ')}` } }
    }

    case 'generate_store_content': {
      const store = await prisma.store.findUnique({ where: { id: storeId } })
      if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
      const text = await generateStoreContent(input.field as StoreContentField, {
        name: store?.name ?? 'Store',
        description: store?.description ?? undefined,
        contactEmail: store?.contactEmail ?? undefined,
        currency: store?.currency ?? undefined,
      })
      await updateStore(storeId, { [input.field]: text })
      return { result: { ok: true, length: text.length }, action: { tool: name, summary: `Generated and saved ${input.field}` } }
    }

    case 'generate_image': {
      const [url] = await generateFromPromptAndUpload(input.prompt, 1)
      if (input.target === 'logo') {
        await updateStore(storeId, { logoUrl: url })
      } else if (input.target === 'favicon') {
        await updateStore(storeId, { faviconUrl: url })
      } else if (input.target === 'category') {
        if (!input.categorySlug) throw new Error('categorySlug is required when target is "category"')
        const category = await prisma.category.findFirst({ where: { storeId, slug: input.categorySlug } })
        if (!category) throw new Error(`Category "${input.categorySlug}" not found`)
        await prisma.category.update({ where: { id: category.id }, data: { imageUrl: url } })
      } else if (input.target === 'blogCover') {
        if (!input.postId) throw new Error('postId is required when target is "blogCover"')
        const post = await prisma.blogPost.findFirst({ where: { id: input.postId, storeId } })
        if (!post) throw new Error('Blog post not found')
        await prisma.blogPost.update({ where: { id: post.id }, data: { coverImage: url } })
      }
      return { result: { url }, action: { tool: name, summary: `Generated and applied ${input.target} image` } }
    }

    case 'create_store': {
      const store = await createStore(input)
      return { result: { id: store.id }, action: { tool: name, summary: `Created store: ${store.name}` } }
    }

    // Theme
    case 'select_or_create_theme': {
      const builtIn = await prisma.theme.findUnique({ where: { storeId_slug: { storeId, slug: input.baseSlug } } })
      if (!builtIn) throw new Error(`Built-in theme "${input.baseSlug}" not found`)

      if (!input.primaryColor && !input.accentColor) {
        return {
          result: { slug: builtIn.slug, name: builtIn.name },
          action: {
            tool: name,
            summary: `Suggested theme: ${builtIn.name}`,
            pendingConfirm: {
              method: 'PUT', path: `/api/admin/themes/${builtIn.slug}/activate`,
              label: 'Make this my live theme',
              description: `Activate "${builtIn.name}" as the store's live theme.`,
            },
          },
        }
      }

      const vars = { ...(builtIn.vars as Record<string, string>) }
      if (input.primaryColor) vars['--primary'] = input.primaryColor
      if (input.accentColor) vars['--accent'] = input.accentColor
      const nameOverride = input.name || `${builtIn.name} (custom)`
      const cloned = await createTheme(storeId, { name: nameOverride, description: builtIn.description ?? undefined, vars, css: builtIn.css, sections: builtIn.sections ?? undefined })
      return {
        result: { slug: cloned.slug, name: cloned.name },
        action: {
          tool: name,
          summary: `Created custom theme: ${cloned.name}`,
          pendingConfirm: {
            method: 'PUT', path: `/api/admin/themes/${cloned.slug}/activate`,
            label: 'Make this my live theme',
            description: `Activate "${cloned.name}" as the store's live theme.`,
          },
        },
      }
    }

    // Categories
    case 'create_category': {
      const category = await createCategory(storeId, { name: input.name, description: input.description })
      return { result: { id: category.id, slug: category.slug }, action: { tool: name, summary: `Created category: ${category.name}` } }
    }

    case 'update_category': {
      const { categoryId, ...rest } = input
      const category = await updateCategory(storeId, categoryId, rest)
      return { result: { ok: true }, action: { tool: name, summary: `Updated category: ${category?.name}` } }
    }

    case 'delete_category': {
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, storeId } })
      if (!category) throw new Error('Category not found')
      const productCount = await prisma.product.count({ where: { categoryId: category.id } })
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting category: ${category.name}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/categories/${category.id}`,
            label: `Delete "${category.name}"`,
            description: productCount > 0
              ? `Delete category "${category.name}" — ${productCount} product(s) are currently assigned to it and will become uncategorized.`
              : `Delete category "${category.name}".`,
          },
        },
      }
    }

    // Products
    case 'search_supplier_products': {
      const supplier = input.supplier || 'cj'
      const adapter = createAdapter(supplier) as any
      if (adapter.withStore) adapter.withStore(storeId)
      const result = await adapter.searchProducts(input.query, 1)
      const products = result.products.slice(0, 8).map((p: any) => ({ id: p.supplierId, title: p.title, image: p.images?.[0] }))
      return { result: { products, total: result.total }, action: { tool: name, summary: `Searched ${supplier} for "${input.query}" — ${products.length} results` } }
    }

    case 'import_supplier_product': {
      const supplier = input.supplier || 'cj'
      const supplierId = await resolveSupplierId(supplier, storeId, input.link)
      const adapter = createAdapter(supplier) as any
      if (adapter.withStore) adapter.withStore(storeId)
      const sp = await adapter.getProduct(supplierId)

      let categoryId: string | undefined
      if (input.categorySlug) {
        const category = await prisma.category.findFirst({ where: { storeId, slug: input.categorySlug } })
        categoryId = category?.id
      }

      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { targetMarkets: true } })
      const targetMarkets = store?.targetMarkets ?? []
      const firstVariantId = sp.variants[0]?.supplierId
      const marketAvailability: Record<string, boolean> = {}
      const marketDetail: Record<string, MarketAvailability> = {}
      await Promise.allSettled(
        targetMarkets.map(async (country) => {
          try {
            const result = await adapter.checkMarketAvailability(supplierId, country, firstVariantId)
            marketAvailability[country] = result.available
            marketDetail[country] = result
          } catch {
            marketAvailability[country] = true
            marketDetail[country] = { available: true }
          }
        })
      )
      const marketDeviationWarnings = computeMarketDeviation(marketDetail)
      const unavailableMarkets = Object.entries(marketAvailability)
        .filter(([, available]) => !available)
        .map(([country]) => country)
      const deliveryNote = buildDeliveryNote(sp.deliveryMinDays, sp.deliveryMaxDays, marketDetail)

      const product = await importSupplierProduct(storeId, {
        supplierId: sp.supplierId,
        supplierName: supplier,
        title: sp.title,
        description: sp.description,
        markup: input.markup,
        images: sp.images,
        variants: sp.variants,
        videoUrl: sp.videoUrl,
        deliveryMinDays: sp.deliveryMinDays,
        deliveryMaxDays: sp.deliveryMaxDays,
        shippingCost: sp.shippingCost,
        categoryId,
        unavailableMarkets,
        deliveryNote,
      })

      const categoryNote = categoryId ? '' : input.categorySlug ? ' (category not found, left unassigned)' : ''
      const landedCostPerUnit = product.variants[0]?.costPerItem
      return {
        result: { id: product.id, title: product.title, categoryId, marketAvailability, marketDeviationWarnings, deliveryNote, landedCostPerUnit, shippingCostIncluded: (sp.shippingCost ?? 0) > 0 },
        action: { tool: name, summary: `Imported product as draft: ${product.title}${categoryNote}` },
      }
    }

    case 'list_products': {
      const products = await prisma.product.findMany({
        where: { storeId, ...(input.onlyUncategorized ? { categoryId: null } : {}) },
        select: {
          id: true, title: true, status: true, categoryId: true, syncAlert: true, createdAt: true,
          unavailableMarkets: true, deliveryNote: true, cjProductId: true, aliexpressProductId: true,
          category: { select: { name: true } },
          variants: {
            select: {
              inventoryQty: true,
              ...(input.includePricing ? { id: true, title: true, price: true, costPerItem: true } : {}),
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      const list = products.map((p: any) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        category: p.category?.name ?? null,
        syncAlert: p.syncAlert ?? null,
        totalInventory: p.variants.reduce((s: number, v: any) => s + (v.inventoryQty ?? 0), 0),
        isSupplierLinked: !!(p.cjProductId || p.aliexpressProductId),
        unavailableMarkets: p.unavailableMarkets ?? [],
        deliveryNote: p.deliveryNote ?? null,
        createdAt: p.createdAt,
        ...(input.includePricing ? { variants: p.variants } : {}),
      }))
      return { result: { products: list }, action: { tool: name, summary: `Listed ${list.length} products` } }
    }

    case 'assign_product_category': {
      const category = await prisma.category.findFirst({ where: { storeId, slug: input.categorySlug } })
      if (!category) throw new Error(`Category "${input.categorySlug}" not found`)
      const existing = await prisma.product.findFirst({ where: { id: input.productId, storeId } })
      if (!existing) throw new Error(`Product not found`)
      await prisma.product.update({ where: { id: existing.id }, data: { categoryId: category.id } })
      return { result: { ok: true }, action: { tool: name, summary: `Assigned "${existing.title}" to ${category.name}` } }
    }

    case 'update_product': {
      const { productId, ...rest } = input
      const product = await updateProduct(storeId, productId, rest)
      return { result: { ok: true }, action: { tool: name, summary: `Updated product: ${product.title}` } }
    }

    case 'set_product_status': {
      const product = await setProductStatus(storeId, input.productId, input.status)
      return { result: { ok: true }, action: { tool: name, summary: `Set "${product?.title}" status to ${input.status}` } }
    }

    case 'enhance_product_ai': {
      if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
      const product = await prisma.product.findFirst({
        where: { id: input.productId, storeId },
        include: { variants: { select: { id: true, title: true, options: true } } },
      })
      if (!product) throw new Error('Product not found')

      const result = await enhanceProduct({
        title: product.title,
        description: product.description,
        shortDescription: product.shortDescription,
        vendor: product.vendor,
        variants: product.variants.map((v) => ({ id: v.id, title: v.title, options: (v.options as Record<string, string>) ?? {} })),
      })

      await updateProduct(storeId, product.id, {
        description: result.description,
        shortDescription: result.shortDescription,
        vendor: result.vendor,
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
        tags: result.tags,
      })
      for (const vr of result.variantRenames) {
        await prisma.productVariant.update({ where: { id: vr.variantId }, data: { title: vr.title, options: vr.options } }).catch(() => {})
      }

      return { result: { ok: true }, action: { tool: name, summary: `AI-enhanced product: ${product.title}` } }
    }

    case 'delete_product': {
      const product = await prisma.product.findFirst({ where: { id: input.productId, storeId } })
      if (!product) throw new Error('Product not found')
      const activeOrderItems = await prisma.orderItem.count({
        where: { variant: { productId: product.id }, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } },
      })
      if (activeOrderItems > 0) {
        throw new Error(`"${product.title}" has active orders and can't be deleted — archive it instead (set_product_status to ARCHIVED).`)
      }
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting product: ${product.title}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/products/${product.id}`,
            label: `Delete "${product.title}"`,
            description: `Permanently delete "${product.title}".`,
          },
        },
      }
    }

    // Discounts
    case 'create_discount': {
      const discount = await createDiscount(storeId, input)
      return { result: { id: discount.id }, action: { tool: name, summary: `Created discount code: ${discount.code}` } }
    }

    case 'update_discount': {
      const { discountId, ...rest } = input
      const discount = await updateDiscount(storeId, discountId, rest)
      return { result: { ok: true }, action: { tool: name, summary: `Updated discount: ${discount?.code}` } }
    }

    case 'delete_discount': {
      const discount = await prisma.discount.findFirst({ where: { id: input.discountId, storeId } })
      if (!discount) throw new Error('Discount not found')
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting discount: ${discount.code}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/discounts/${discount.id}`,
            label: `Delete "${discount.code}"`,
            description: `Permanently delete discount code "${discount.code}".`,
          },
        },
      }
    }

    // Reviews
    case 'moderate_review': {
      const review = await moderateReview(storeId, input.reviewId, input.status)
      return { result: { ok: true }, action: { tool: name, summary: `Marked review as ${review.status.toLowerCase()}` } }
    }

    case 'delete_review': {
      const review = await prisma.review.findFirst({ where: { id: input.reviewId, storeId } })
      if (!review) throw new Error('Review not found')
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting a ${review.rating}-star review`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/reviews/${review.id}`,
            label: 'Delete review',
            description: `Permanently delete this ${review.rating}-star review${review.title ? ` ("${review.title}")` : ''}.`,
          },
        },
      }
    }

    // Blog
    case 'create_blog_post': {
      const post = await createBlogPost(storeId, input)
      return { result: { id: post.id, slug: post.slug }, action: { tool: name, summary: `Created blog post draft: ${post.title}` } }
    }

    case 'update_blog_post': {
      const { postId, ...rest } = input
      const existing = await prisma.blogPost.findFirst({ where: { id: postId, storeId } })
      if (!existing) throw new Error('Post not found')
      const post = await updateBlogPost(storeId, postId, { title: rest.title ?? existing.title, content: rest.content ?? existing.content, excerpt: rest.excerpt ?? existing.excerpt ?? undefined, coverImage: rest.coverImage ?? existing.coverImage ?? undefined, seoTitle: rest.seoTitle ?? existing.seoTitle ?? undefined, seoDescription: rest.seoDescription ?? existing.seoDescription ?? undefined, tags: rest.tags ?? existing.tags })
      return { result: { ok: true }, action: { tool: name, summary: `Updated blog post: ${post?.title}` } }
    }

    case 'publish_blog_post': {
      const post = await setBlogPostPublished(storeId, input.postId, true)
      return { result: { ok: true }, action: { tool: name, summary: `Published blog post: ${post?.title}` } }
    }

    case 'unpublish_blog_post': {
      const post = await setBlogPostPublished(storeId, input.postId, false)
      return { result: { ok: true }, action: { tool: name, summary: `Unpublished blog post: ${post?.title}` } }
    }

    case 'delete_blog_post': {
      const post = await prisma.blogPost.findFirst({ where: { id: input.postId, storeId } })
      if (!post) throw new Error('Post not found')
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting blog post: ${post.title}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/blog/${post.id}`,
            label: `Delete "${post.title}"`,
            description: `Permanently delete blog post "${post.title}".`,
          },
        },
      }
    }

    // Translations
    case 'translate_product': {
      const product = await prisma.product.findFirst({ where: { id: input.productId, storeId } })
      if (!product) throw new Error('Product not found')
      const locale = input.targetLocale as Locale
      const translated = await translateProductContent({
        title: product.title,
        shortDescription: product.shortDescription,
        description: product.description,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
      }, locale)
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale } },
        create: { productId: product.id, locale, ...translated },
        update: translated,
      })
      return { result: { ok: true }, action: { tool: name, summary: `Translated "${product.title}" into ${locale.toUpperCase()}` } }
    }

    case 'translate_category': {
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, storeId } })
      if (!category) throw new Error('Category not found')
      const locale = input.targetLocale as Locale
      const translated = await translateCategoryContent({ name: category.name, description: category.description }, locale)
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale } },
        create: { categoryId: category.id, locale, ...translated },
        update: translated,
      })
      return { result: { ok: true }, action: { tool: name, summary: `Translated category "${category.name}" into ${locale.toUpperCase()}` } }
    }

    case 'translate_store_content': {
      const store = await prisma.store.findUnique({ where: { id: storeId } })
      if (!store) throw new Error('Store not found')
      const locale = input.targetLocale as Locale
      const ALL_FIELDS = ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent'] as const
      const wanted: readonly string[] = input.fields ?? ALL_FIELDS
      const fields: Record<string, string> = {}
      for (const key of wanted) {
        const value = (store as any)[key]
        if (value) fields[key] = value
      }
      if (Object.keys(fields).length === 0) throw new Error('No store content to translate yet — write the About Us or policy pages first (generate_store_content can do that).')

      const translated = await translateStoreContent(fields, locale)
      await prisma.storeTranslation.upsert({
        where: { storeId_locale: { storeId, locale } },
        create: { storeId, locale, ...translated },
        update: translated,
      })
      return { result: { ok: true, translated: Object.keys(translated) }, action: { tool: name, summary: `Translated ${Object.keys(translated).join(', ')} into ${locale.toUpperCase()}` } }
    }

    case 'translate_theme': {
      const locale = input.targetLocale as Locale
      const theme = await prisma.theme.findUnique({ where: { storeId_slug: { storeId, slug: input.slug } } })
      if (!theme) throw new Error(`Theme "${input.slug}" not found`)
      const entries = extractThemeStrings(theme.sections)
      if (entries.length === 0) throw new Error('This theme has no translatable text yet — add sections with headings, text, or nav labels first.')
      const translated = await translateThemeStrings(entries, locale)
      await saveThemeTranslation(storeId, input.slug, locale, translated)
      return { result: { ok: true, count: Object.keys(translated).length }, action: { tool: name, summary: `Translated ${Object.keys(translated).length} text snippet(s) in "${theme.name}" into ${locale.toUpperCase()}` } }
    }

    // Subscribers
    case 'list_subscribers': {
      const subscribers = await prisma.emailSubscriber.findMany({
        where: { storeId, ...(input.onlyActive ? { isActive: true } : {}) },
        select: { id: true, email: true, isActive: true, createdAt: true },
        take: 200,
        orderBy: { createdAt: 'desc' },
      })
      return { result: { subscribers }, action: { tool: name, summary: `Listed ${subscribers.length} subscribers` } }
    }

    case 'delete_subscriber': {
      const sub = await prisma.emailSubscriber.findFirst({ where: { id: input.subscriberId, storeId } })
      if (!sub) throw new Error('Subscriber not found')
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed removing subscriber: ${sub.email}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/subscribers/${sub.id}`,
            label: `Remove ${sub.email}`,
            description: `Permanently remove "${sub.email}" from the subscriber list.`,
          },
        },
      }
    }

    // Shipping
    case 'create_shipping_zone': {
      const zone = await createShippingZone(storeId, input)
      return { result: { id: zone.id }, action: { tool: name, summary: `Created shipping zone: ${zone.name}` } }
    }

    case 'create_shipping_rate': {
      const { zoneId, ...rest } = input
      const rate = await createShippingRate(storeId, zoneId, rest)
      return { result: { id: rate.id }, action: { tool: name, summary: `Added shipping rate: ${rate.name} ($${rate.price})` } }
    }

    case 'delete_shipping_rate': {
      const rate = await prisma.shippingRate.findUnique({ where: { id: input.rateId }, include: { zone: true } })
      if (!rate || rate.zone.storeId !== storeId) throw new Error('Shipping rate not found')
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed deleting shipping rate: ${rate.name}`,
          pendingConfirm: {
            method: 'DELETE', path: `/api/admin/shipping/rates/${rate.id}`,
            label: `Delete "${rate.name}"`,
            description: `Permanently delete shipping rate "${rate.name}" from zone "${rate.zone.name}".`,
          },
        },
      }
    }

    // Orders
    case 'list_orders': {
      const where: any = { storeId }
      if (input.status) where.status = input.status
      if (input.search) {
        const num = parseInt(input.search)
        where.OR = [
          ...(isNaN(num) ? [] : [{ orderNumber: num }]),
          { guestEmail: { contains: input.search, mode: 'insensitive' } },
          { customer: { email: { contains: input.search, mode: 'insensitive' } } },
        ]
      }
      const orders = await prisma.order.findMany({
        where, take: 50, orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, total: true, currency: true, guestEmail: true, customer: { select: { email: true } } },
      })
      return { result: { orders }, action: { tool: name, summary: `Listed ${orders.length} orders` } }
    }

    case 'get_order': {
      const order = await prisma.order.findFirst({
        where: { id: input.orderId, storeId },
        include: {
          customer: true,
          supplierOrders: { include: { items: true } },
          timeline: { orderBy: { createdAt: 'asc' } },
          refunds: true,
        },
      })
      if (!order) throw new Error('Order not found')
      return { result: { order }, action: { tool: name, summary: `Looked up order #${order.orderNumber}` } }
    }

    case 'fulfill_order': {
      const so = await prisma.supplierOrder.findFirst({ where: { id: input.supplierOrderId, storeId } })
      if (!so) throw new Error('Parcel not found')
      const updated = await fulfillSupplierOrderManually(so.id, { trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl }, ASSISTANT_ACTOR)
      return { result: { ok: true }, action: { tool: name, summary: `Marked a parcel of order (supplier order ${updated.id}) shipped with tracking ${input.trackingNumber}` } }
    }

    case 'add_order_note': {
      const order = await addOrderNote(storeId, input.orderId, input.message, ASSISTANT_ACTOR)
      return { result: { ok: true }, action: { tool: name, summary: `Added a note to order #${order.orderNumber}` } }
    }

    case 'cancel_order': {
      const order = await prisma.order.findFirst({ where: { id: input.orderId, storeId } })
      if (!order) throw new Error('Order not found')
      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new Error(`Order #${order.orderNumber} has already shipped and can't be cancelled.`)
      }
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed cancelling order #${order.orderNumber}`,
          pendingConfirm: {
            method: 'PATCH', path: `/api/admin/orders/${order.id}/cancel`,
            label: `Cancel order #${order.orderNumber}`,
            description: `Cancel order #${order.orderNumber}. The customer is not automatically refunded — do that separately if needed.`,
          },
        },
      }
    }

    case 'list_pending_fulfillments': {
      const where: any = { storeId, status: input.status ? input.status : { in: ['AWAITING_MANUAL', 'ERROR'] } }
      const parcels = await prisma.supplierOrder.findMany({
        where,
        include: {
          items: { select: { title: true, quantity: true } },
          order: { select: { orderNumber: true, guestEmail: true, customer: { select: { email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      })
      const list = parcels.map((so) => ({
        supplierOrderId: so.id, orderNumber: so.order.orderNumber,
        customerEmail: so.order.customer?.email ?? so.order.guestEmail,
        supplierKey: so.supplierKey, supplierName: so.supplierName,
        status: so.status, lastError: so.lastError, attempts: so.attempts,
        items: so.items.map((i) => `${i.quantity}x ${i.title}`),
        createdAt: so.createdAt,
      }))
      return { result: { parcels: list }, action: { tool: name, summary: `Listed ${list.length} parcel(s) needing fulfillment attention` } }
    }

    case 'get_fulfillment_details': {
      const so = await prisma.supplierOrder.findFirst({
        where: { id: input.supplierOrderId, storeId },
        include: {
          items: true,
          order: { select: { orderNumber: true, shippingAddress: true, guestEmail: true, customer: { select: { email: true } } } },
        },
      })
      if (!so) throw new Error('Parcel not found')
      return { result: { parcel: so }, action: { tool: name, summary: `Looked up parcel for order #${so.order.orderNumber}` } }
    }

    case 'fulfill_order_with_supplier': {
      const order = await prisma.order.findFirst({
        where: { id: input.orderId, storeId },
        include: { items: { include: { variant: { include: { product: true } } } }, supplierOrders: true },
      })
      if (!order) throw new Error('Order not found')
      const supplier = input.supplier
      const supplierKey = supplier === 'cj' ? 'CJ' : 'ALIEXPRESS'
      const existingSupplierOrder = order.supplierOrders.find((so) => so.supplierKey === supplierKey)
      if (existingSupplierOrder && (existingSupplierOrder.status === 'SUBMITTED' || existingSupplierOrder.status === 'SHIPPED')) {
        throw new Error(`Already submitted to ${supplier === 'cj' ? 'CJ' : 'AliExpress'} (order ID: ${existingSupplierOrder.externalOrderId})`)
      }
      if (supplier === 'cj') {
        const hasItems = order.items.some((i) => i.variant?.cjVariantId)
        if (!hasItems) throw new Error('No CJ products in this order.')
      } else {
        const hasItems = order.items.some((i) => i.variant?.product?.aliexpressProductId)
        if (!hasItems) throw new Error('No AliExpress products in this order.')
      }
      return {
        result: { ok: true },
        action: {
          tool: name,
          summary: `Proposed fulfilling order #${order.orderNumber} via ${supplier === 'cj' ? 'CJ' : 'AliExpress'}`,
          pendingConfirm: {
            method: 'POST', path: `/api/admin/orders/${order.id}/fulfill-${supplier}`,
            label: `Place ${supplier === 'cj' ? 'CJ' : 'AliExpress'} order`,
            description: `Place a real, paid order with ${supplier === 'cj' ? 'CJ Dropshipping' : 'AliExpress'} to fulfill order #${order.orderNumber}. This spends real money with the supplier.`,
          },
        },
      }
    }

    case 'refund_order': {
      const order = await prisma.order.findFirst({ where: { id: input.orderId, storeId }, include: { refunds: true } })
      if (!order) throw new Error('Order not found')
      if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') throw new Error('Order is not paid.')
      const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0)
      const refundable = order.total - alreadyRefunded
      if (input.amount > refundable + 0.01) {
        throw new Error(`Requested amount ($${input.amount.toFixed(2)}) exceeds the refundable balance ($${refundable.toFixed(2)}).`)
      }
      return {
        result: { ok: true, refundable },
        action: {
          tool: name,
          summary: `Proposed refunding $${input.amount.toFixed(2)} on order #${order.orderNumber}`,
          pendingConfirm: {
            method: 'POST', path: `/api/admin/orders/${order.id}/refund`,
            body: { amount: input.amount, reason: input.reason },
            label: `Refund $${input.amount.toFixed(2)}`,
            description: `Refund $${input.amount.toFixed(2)} to the customer via Stripe for order #${order.orderNumber}${input.reason ? ` — reason: ${input.reason}` : ''}.`,
          },
        },
      }
    }

    // Customers (read-only)
    case 'list_customers': {
      const where: any = { storeId }
      if (input.search) {
        where.OR = [
          { email: { contains: input.search, mode: 'insensitive' } },
          { firstName: { contains: input.search, mode: 'insensitive' } },
          { lastName: { contains: input.search, mode: 'insensitive' } },
        ]
      }
      const customers = await prisma.customer.findMany({
        where, take: 50, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, firstName: true, lastName: true, _count: { select: { orders: true } } },
      })
      return { result: { customers }, action: { tool: name, summary: `Listed ${customers.length} customers` } }
    }

    case 'get_customer': {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, storeId },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, addresses: true, orders: { select: { orderNumber: true, status: true, total: true } } },
      })
      if (!customer) throw new Error('Customer not found')
      return { result: { customer }, action: { tool: name, summary: `Looked up customer: ${customer.email}` } }
    }

    // Store readiness / SEO health (read-only)
    case 'get_store_health': {
      const report = await getStoreHealth(storeId)
      return { result: { report }, action: { tool: name, summary: `Checked store health — score ${report.overallScore}/100` } }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Agent loop ───────────────────────────────────────────────────────────

export async function runAssistantTurn(
  storeId: string,
  history: Anthropic.MessageParam[],
  userMessage: string
): Promise<{ reply: string; actions: AssistantAction[]; messages: Anthropic.MessageParam[] }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const snapshot = await storeSnapshot(storeId)
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userMessage }]
  const actions: AssistantAction[] = []

  for (let i = 0; i < MAX_TURNS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'disabled' },
      system: systemPrompt(snapshot),
      tools: TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
      if (response.stop_reason === 'max_tokens') {
        // Response got cut off mid-generation — never surface a blank/truncated reply as if it were final.
        const fallback = text.trim()
          ? `${text.trim()}\n\n(I got cut off there — say "continue" and I'll pick back up.)`
          : 'I was in the middle of a longer response and ran out of room before I could act. Say "continue" and I\'ll pick back up — or ask for a smaller batch at a time.'
        return { reply: fallback, actions, messages }
      }
      return { reply: text, actions, messages }
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      try {
        const { result, action } = await runTool(storeId, block.name, block.input)
        actions.push(action)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      } catch (err: any) {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: err.message ?? 'Tool call failed', is_error: true })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return { reply: "I've made a lot of changes in this turn — let's pause here. What would you like next?", actions, messages }
}
