import { prisma } from '../config/database'
import { env } from '../config/env'
import { resolveComplianceProfile, findMissingComplianceFields } from '../lib/complianceProfiles'

export type HealthCategoryId =
  | 'store_seo'
  | 'product_seo'
  | 'category_content'
  | 'infrastructure'
  | 'content_completeness'

export type HealthSeverity = 'critical' | 'warning' | 'info'

export interface HealthCheckResult {
  id: string
  category: HealthCategoryId
  label: string
  severity: HealthSeverity
  status: 'pass' | 'fail'
  message: string
  affectedCount: number
  totalCount: number
  affectedItems?: { id: string; name: string }[]
}

export interface HealthCategoryResult {
  category: HealthCategoryId
  label: string
  score: number
  weight: number
  checks: HealthCheckResult[]
}

export interface HealthAdvisory {
  id: string
  message: string
}

export interface StoreHealthReport {
  storeId: string
  generatedAt: string
  overallScore: number
  blockers: HealthCheckResult[]
  categories: HealthCategoryResult[]
  advisories: HealthAdvisory[]
}

const CATEGORY_LABELS: Record<HealthCategoryId, string> = {
  store_seo: 'Store SEO',
  product_seo: 'Product SEO',
  category_content: 'Category Content',
  infrastructure: 'Site Infrastructure',
  content_completeness: 'Content Completeness',
}

const CATEGORY_WEIGHTS: Record<HealthCategoryId, number> = {
  store_seo: 20,
  product_seo: 30,
  infrastructure: 25,
  content_completeness: 15,
  category_content: 10,
}

const SEVERITY_WEIGHT: Record<HealthSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

const AFFECTED_ITEMS_LIMIT = 20

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function check(params: {
  id: string
  category: HealthCategoryId
  label: string
  severity: HealthSeverity
  totalCount: number
  affected: { id: string; name: string }[]
  passMessage: string
  failMessage: string
}): HealthCheckResult {
  const { id, category, label, severity, totalCount, affected, passMessage, failMessage } = params
  const affectedCount = affected.length
  const status: 'pass' | 'fail' = affectedCount === 0 ? 'pass' : 'fail'
  return {
    id,
    category,
    label,
    severity,
    status,
    message: status === 'pass' ? passMessage : failMessage,
    affectedCount,
    totalCount,
    affectedItems: affectedCount > 0 ? affected.slice(0, AFFECTED_ITEMS_LIMIT) : undefined,
  }
}

async function checkStoreSeo(storeId: string): Promise<HealthCheckResult[]> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { metaTitle: true, metaDescription: true, faviconUrl: true, logoUrl: true },
  })
  const item = store ? [{ id: storeId, name: 'Store settings' }] : []

  return [
    check({
      id: 'store_meta_title',
      category: 'store_seo',
      label: 'Store meta title',
      severity: 'critical',
      totalCount: 1,
      affected: !store?.metaTitle || store.metaTitle.length > 60 ? item : [],
      passMessage: 'Store meta title is set and within 60 characters.',
      failMessage: !store?.metaTitle
        ? 'Store meta title is missing.'
        : 'Store meta title is longer than 60 characters.',
    }),
    check({
      id: 'store_meta_description',
      category: 'store_seo',
      label: 'Store meta description',
      severity: 'critical',
      totalCount: 1,
      affected: !store?.metaDescription || store.metaDescription.length > 160 ? item : [],
      passMessage: 'Store meta description is set and within 160 characters.',
      failMessage: !store?.metaDescription
        ? 'Store meta description is missing.'
        : 'Store meta description is longer than 160 characters.',
    }),
    check({
      id: 'store_favicon',
      category: 'store_seo',
      label: 'Store favicon',
      severity: 'warning',
      totalCount: 1,
      affected: !store?.faviconUrl ? item : [],
      passMessage: 'Favicon is set.',
      failMessage: 'Favicon is missing.',
    }),
    check({
      id: 'store_logo',
      category: 'store_seo',
      label: 'Store logo',
      severity: 'warning',
      totalCount: 1,
      affected: !store?.logoUrl ? item : [],
      passMessage: 'Logo is set.',
      failMessage: 'Logo is missing.',
    }),
  ]
}

async function checkProductSeo(storeId: string): Promise<HealthCheckResult[]> {
  const products = await prisma.product.findMany({
    where: { storeId, status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      metaTitle: true,
      metaDescription: true,
      description: true,
      images: { select: { altText: true } },
    },
  })

  const totalCount = products.length
  const missingMetaTitle = products.filter((p) => !p.metaTitle).map((p) => ({ id: p.id, name: p.title }))
  const missingMetaDescription = products
    .filter((p) => !p.metaDescription)
    .map((p) => ({ id: p.id, name: p.title }))
  const thinDescription = products
    .filter((p) => !p.description || stripHtml(p.description).length < 60)
    .map((p) => ({ id: p.id, name: p.title }))
  const missingImages = products.filter((p) => p.images.length === 0).map((p) => ({ id: p.id, name: p.title }))
  const missingAltText = products
    .filter((p) => p.images.length > 0 && p.images.some((img) => !img.altText))
    .map((p) => ({ id: p.id, name: p.title }))

  return [
    check({
      id: 'product_meta_title',
      category: 'product_seo',
      label: 'Product meta titles',
      severity: 'warning',
      totalCount,
      affected: missingMetaTitle,
      passMessage: 'All active products have a meta title.',
      failMessage: `${missingMetaTitle.length} of ${totalCount} active products are missing a meta title.`,
    }),
    check({
      id: 'product_meta_description',
      category: 'product_seo',
      label: 'Product meta descriptions',
      severity: 'warning',
      totalCount,
      affected: missingMetaDescription,
      passMessage: 'All active products have a meta description.',
      failMessage: `${missingMetaDescription.length} of ${totalCount} active products are missing a meta description.`,
    }),
    check({
      id: 'product_description_thin',
      category: 'product_seo',
      label: 'Product description length',
      severity: 'warning',
      totalCount,
      affected: thinDescription,
      passMessage: 'All active products have a substantial description.',
      failMessage: `${thinDescription.length} of ${totalCount} active products have a missing or thin description (under 60 characters).`,
    }),
    check({
      id: 'product_images_present',
      category: 'product_seo',
      label: 'Product images',
      severity: 'critical',
      totalCount,
      affected: missingImages,
      passMessage: 'All active products have at least one image.',
      failMessage: `${missingImages.length} of ${totalCount} active products have no images.`,
    }),
    check({
      id: 'product_image_alt_text',
      category: 'product_seo',
      label: 'Product image alt text',
      severity: 'info',
      totalCount,
      affected: missingAltText,
      passMessage: 'All active product images have alt text.',
      failMessage: `${missingAltText.length} of ${totalCount} active products have at least one image missing alt text.`,
    }),
  ]
}

async function checkCategoryContent(storeId: string): Promise<HealthCheckResult[]> {
  const categories = await prisma.category.findMany({
    where: { storeId, isVisible: true },
    select: { id: true, name: true, description: true, imageUrl: true },
  })

  const totalCount = categories.length
  const missingDescription = categories
    .filter((c) => !c.description || !c.description.trim())
    .map((c) => ({ id: c.id, name: c.name }))
  const missingImage = categories.filter((c) => !c.imageUrl).map((c) => ({ id: c.id, name: c.name }))

  return [
    check({
      id: 'category_description',
      category: 'category_content',
      label: 'Category descriptions',
      severity: 'warning',
      totalCount,
      affected: missingDescription,
      passMessage: 'All visible categories have a description.',
      failMessage: `${missingDescription.length} of ${totalCount} visible categories are missing a description.`,
    }),
    check({
      id: 'category_image',
      category: 'category_content',
      label: 'Category images',
      severity: 'info',
      totalCount,
      affected: missingImage,
      passMessage: 'All visible categories have an image.',
      failMessage: `${missingImage.length} of ${totalCount} visible categories are missing an image.`,
    }),
  ]
}

async function checkInfrastructure(storeId: string): Promise<HealthCheckResult[]> {
  const zonesWithRates = await prisma.shippingZone.count({
    where: { storeId, rates: { some: {} } },
  })
  const zoneItem = zonesWithRates === 0 ? [{ id: storeId, name: 'Store' }] : []
  const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY) && Boolean(env.STRIPE_PUBLISHABLE_KEY)
  const webhookConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET)

  return [
    check({
      id: 'payments_configured',
      category: 'infrastructure',
      label: 'Payments (Stripe) configured',
      severity: 'critical',
      totalCount: 1,
      affected: stripeConfigured ? [] : [{ id: storeId, name: 'Store' }],
      passMessage: 'Stripe secret and publishable keys are configured.',
      failMessage: 'Stripe is not fully configured — checkout will not work.',
    }),
    check({
      id: 'payments_webhook_configured',
      category: 'infrastructure',
      label: 'Payments webhook configured',
      severity: 'warning',
      totalCount: 1,
      affected: webhookConfigured ? [] : [{ id: storeId, name: 'Store' }],
      passMessage: 'Stripe webhook secret is configured.',
      failMessage: 'Stripe webhook secret is not configured — order status may not update automatically.',
    }),
    check({
      id: 'shipping_configured',
      category: 'infrastructure',
      label: 'Shipping configured',
      severity: 'critical',
      totalCount: 1,
      affected: zoneItem,
      passMessage: 'At least one shipping zone has a rate configured.',
      failMessage: 'No shipping zone has a rate configured — customers cannot check out.',
    }),
  ]
}

// Live products whose compliance profile still has empty required fields. The product API
// blocks publishing in that state, so this normally passes — it catches products that went
// ACTIVE before a profile was assigned, or whose category profile changed underneath them
// (assigning ELECTRONICS to an existing category retroactively puts every live product in it
// out of compliance). Critical, so it caps the overall score at 59 the same way an
// unconfigured payment or shipping setup does: in both cases the store shouldn't be selling.
async function checkCompliance(storeId: string): Promise<HealthCheckResult[]> {
  const products = await prisma.product.findMany({
    where: { storeId, status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      complianceProfile: true,
      complianceData: true,
      category: { select: { complianceProfile: true } },
    },
  })

  const nonCompliant: { id: string; name: string }[] = []
  let inScope = 0
  for (const p of products) {
    const profile = resolveComplianceProfile(p.complianceProfile, p.category?.complianceProfile)
    if (profile === 'NONE') continue
    inScope++
    if (findMissingComplianceFields(profile, p.complianceData).length > 0) {
      nonCompliant.push({ id: p.id, name: p.title })
    }
  }

  return [
    check({
      id: 'product_compliance_complete',
      category: 'content_completeness',
      label: 'Product compliance information',
      severity: 'critical',
      totalCount: inScope,
      affected: nonCompliant,
      passMessage:
        inScope === 0
          ? 'No live products require compliance information.'
          : `All ${inScope} live products that require compliance information have it.`,
      failMessage: `${nonCompliant.length} of ${inScope} live products are missing required compliance information and should be unpublished until it is filled in.`,
    }),
  ]
}

async function checkContentCompleteness(storeId: string): Promise<HealthCheckResult[]> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      aboutUs: true,
      shippingPolicy: true,
      returnPolicy: true,
      privacyPolicy: true,
      termsOfService: true,
      faqContent: true,
    },
  })
  const item = (empty: boolean) => (empty ? [{ id: storeId, name: 'Store' }] : [])
  const isEmpty = (v: string | null | undefined) => !v || !v.trim()

  return [
    check({
      id: 'content_about_us',
      category: 'content_completeness',
      label: 'About Us page',
      severity: 'warning',
      totalCount: 1,
      affected: item(isEmpty(store?.aboutUs)),
      passMessage: 'About Us content is set.',
      failMessage: 'About Us content is missing.',
    }),
    check({
      id: 'content_shipping_policy',
      category: 'content_completeness',
      label: 'Shipping policy',
      severity: 'warning',
      totalCount: 1,
      affected: item(isEmpty(store?.shippingPolicy)),
      passMessage: 'Shipping policy content is set.',
      failMessage: 'Shipping policy content is missing.',
    }),
    check({
      id: 'content_return_policy',
      category: 'content_completeness',
      label: 'Return policy',
      severity: 'warning',
      totalCount: 1,
      affected: item(isEmpty(store?.returnPolicy)),
      passMessage: 'Return policy content is set.',
      failMessage: 'Return policy content is missing.',
    }),
    check({
      id: 'content_privacy_policy',
      category: 'content_completeness',
      label: 'Privacy policy',
      severity: 'warning',
      totalCount: 1,
      affected: item(isEmpty(store?.privacyPolicy)),
      passMessage: 'Privacy policy content is set.',
      failMessage: 'Privacy policy content is missing.',
    }),
    check({
      id: 'content_terms_of_service',
      category: 'content_completeness',
      label: 'Terms of service',
      severity: 'warning',
      totalCount: 1,
      affected: item(isEmpty(store?.termsOfService)),
      passMessage: 'Terms of service content is set.',
      failMessage: 'Terms of service content is missing.',
    }),
    check({
      id: 'content_faq',
      category: 'content_completeness',
      label: 'FAQ content',
      severity: 'info',
      totalCount: 1,
      affected: item(isEmpty(store?.faqContent)),
      passMessage: 'FAQ content is set.',
      failMessage: 'FAQ content is missing.',
    }),
  ]
}

function buildAdvisories(): HealthAdvisory[] {
  return [
    {
      id: 'product_structured_data',
      message:
        'Product structured data (JSON-LD) on the storefront always reports "InStock" availability and never includes review/rating data, regardless of actual inventory or reviews. This is a storefront code limitation, not a per-product content issue — consider it a follow-up fix, not something fixable from the admin panel.',
    },
  ]
}

function rollUpCategory(category: HealthCategoryId, checks: HealthCheckResult[]): HealthCategoryResult {
  const totalWeight = checks.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0)
  const passWeight = checks
    .filter((c) => c.status === 'pass')
    .reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0)
  const score = totalWeight === 0 ? 100 : Math.round((passWeight / totalWeight) * 100)

  return {
    category,
    label: CATEGORY_LABELS[category],
    score,
    weight: CATEGORY_WEIGHTS[category],
    checks,
  }
}

export async function getStoreHealth(storeId: string): Promise<StoreHealthReport> {
  const [storeSeo, productSeo, categoryContent, infrastructure, contentCompleteness, compliance] = await Promise.all([
    checkStoreSeo(storeId),
    checkProductSeo(storeId),
    checkCategoryContent(storeId),
    checkInfrastructure(storeId),
    checkContentCompleteness(storeId),
    checkCompliance(storeId),
  ])

  const categories: HealthCategoryResult[] = [
    rollUpCategory('store_seo', storeSeo),
    rollUpCategory('product_seo', productSeo),
    rollUpCategory('category_content', categoryContent),
    rollUpCategory('infrastructure', infrastructure),
    // Compliance rides in the content-completeness bucket rather than getting its own weighted
    // category — it is "required content that is missing", and a new category would silently
    // re-weight every existing store's score.
    rollUpCategory('content_completeness', [...contentCompleteness, ...compliance]),
  ]

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0)
  const weightedScore = categories.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
  let overallScore = Math.round(weightedScore)

  const allChecks = categories.flatMap((c) => c.checks)
  const blockers = allChecks.filter((c) => c.severity === 'critical' && c.status === 'fail')
  if (blockers.length > 0) {
    overallScore = Math.min(overallScore, 59)
  }

  return {
    storeId,
    generatedAt: new Date().toISOString(),
    overallScore,
    blockers,
    categories,
    advisories: buildAdvisories(),
  }
}
