import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { resolveStore } from './middleware/resolveStore'
import { resolveLocale } from './middleware/resolveLocale'

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// Each store's storefront is deployed under its own domain, so the allowlist
// is STORE_URL/ADMIN_URL plus any extra storefront domains in STORE_URLS.
const allowedOrigins = Array.from(new Set([
  env.STORE_URL,
  env.ADMIN_URL,
  ...env.STORE_URLS.split(',').map((s) => s.trim()).filter(Boolean),
]))
app.use(cors({ origin: allowedOrigins, credentials: true }))

import stripeWebhookRoutes from './routes/webhooks/stripe'
import cjWebhookRoutes from './routes/webhooks/cj'
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes)
app.use('/api/webhooks/cj', cjWebhookRoutes)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
if (env.NODE_ENV !== 'test') app.use(morgan('dev'))
app.use(resolveStore)
app.use(resolveLocale)

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: 'neon-cloud',
    storage: 'cloudinary',
    email: 'resend',
  })
})

import adminAuthRoutes from './routes/admin/auth'
import adminCategoryRoutes from './routes/admin/categories'
import adminProductRoutes from './routes/admin/products'
import adminUploadRoutes from './routes/admin/uploads'

app.use('/api/admin/auth', adminAuthRoutes)
app.use('/api/admin/categories', adminCategoryRoutes)
app.use('/api/admin/products', adminProductRoutes)
app.use('/api/admin/uploads', adminUploadRoutes)

import storeProductRoutes from './routes/store/products'
import storeCategoryRoutes from './routes/store/categories'
import storeSearchRoutes from './routes/store/search'

app.use('/api/store/products', storeProductRoutes)
app.use('/api/store/categories', storeCategoryRoutes)
app.use('/api/store/search', storeSearchRoutes)

import storeCartRoutes from './routes/store/cart'
import storeCheckoutRoutes from './routes/store/checkout'
import storeStoreRoutes from './routes/store/store'

app.use('/api/store/cart', storeCartRoutes)
app.use('/api/store/checkout', storeCheckoutRoutes)
app.use('/api/store/store', storeStoreRoutes)

import adminOrderRoutes from './routes/admin/orders'
import adminCustomerRoutes from './routes/admin/customers'
import adminClaimRoutes from './routes/admin/claims'
import storeAuthRoutes from './routes/store/auth'
import storeOrderRoutes from './routes/store/orders'
import storeClaimRoutes from './routes/store/claims'

app.use('/api/admin/orders', adminOrderRoutes)
app.use('/api/admin/customers', adminCustomerRoutes)
app.use('/api/admin/claims', adminClaimRoutes)
app.use('/api/store/auth', storeAuthRoutes)
app.use('/api/store/orders', storeOrderRoutes)
app.use('/api/store/claims', storeClaimRoutes)

import adminDiscountRoutes from './routes/admin/discounts'
import adminShippingRoutes from './routes/admin/shipping'
import adminStoreRoutes from './routes/admin/store'
import adminAnalyticsRoutes from './routes/admin/analytics'
import adminSupplierRoutes from './routes/admin/supplier'
import adminAiRoutes from './routes/admin/ai'
import adminImageStudioRoutes from './routes/admin/imageStudio'
import adminBlogRoutes from './routes/admin/blog'
import adminThemeRoutes from './routes/admin/themes'
import storeBlogRoutes from './routes/store/blog'
import storeNewsletterRoutes from './routes/store/newsletter'
import adminReviewRoutes from './routes/admin/reviews'
import adminSubscriberRoutes from './routes/admin/subscribers'
import adminSyncRoutes from './routes/admin/sync'
import adminSandboxRoutes from './routes/admin/sandbox'
import storeReviewRoutes from './routes/store/reviews'
import adminSetupAssistantRoutes from './routes/admin/setupAssistant'
import adminStoreHealthRoutes from './routes/admin/storeHealth'

app.use('/api/admin/discounts', adminDiscountRoutes)
app.use('/api/admin/shipping', adminShippingRoutes)
app.use('/api/admin/store', adminStoreRoutes)
app.use('/api/admin/analytics', adminAnalyticsRoutes)
app.use('/api/admin/supplier', adminSupplierRoutes)
app.use('/api/admin/ai', adminAiRoutes)
app.use('/api/admin/image-studio', adminImageStudioRoutes)
app.use('/api/admin/blog', adminBlogRoutes)
app.use('/api/admin/themes', adminThemeRoutes)
app.use('/api/admin/reviews', adminReviewRoutes)
app.use('/api/admin/subscribers', adminSubscriberRoutes)
app.use('/api/admin/sync', adminSyncRoutes)
app.use('/api/admin/sandbox', adminSandboxRoutes)
app.use('/api/store/blog', storeBlogRoutes)
app.use('/api/store/newsletter', storeNewsletterRoutes)
app.use('/api/store/reviews', storeReviewRoutes)
app.use('/api/admin/setup-assistant', adminSetupAssistantRoutes)
app.use('/api/admin/store-health', adminStoreHealthRoutes)

app.use(errorHandler)
export default app
