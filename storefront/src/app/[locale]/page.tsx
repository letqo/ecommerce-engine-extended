import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import HeroBanner from '@/components/HeroBanner'
import ProductCard from '@/components/ProductCard'
import NewsletterSection from '@/components/NewsletterSection'
import BrandStatement from '@/components/BrandStatement'
import CategoriesSection from '@/components/sections/CategoriesSection'
import TestimonialsSection from '@/components/sections/TestimonialsSection'
import TrustBadgesSection from '@/components/sections/TrustBadgesSection'
import PromoBannerSection from '@/components/sections/PromoBannerSection'
import ImageWithTextSection from '@/components/sections/ImageWithTextSection'
import BrandLogosSection from '@/components/sections/BrandLogosSection'
import NewArrivalsSection from '@/components/sections/NewArrivalsSection'
import BestSellersSection from '@/components/sections/BestSellersSection'
import CountdownSection from '@/components/sections/CountdownSection'
import FaqSection from '@/components/sections/FaqSection'
import VideoSection from '@/components/sections/VideoSection'
import BlogPostsSection from '@/components/sections/BlogPostsSection'
import IconRowSection from '@/components/sections/IconRowSection'
import { getStoreInfo, buildAlternates, STORE_ID } from '@/lib/seo'
import { getThemeConfig } from '@/themes'
import type { HomeSection } from '@/themes'

const API = process.env.NEXT_PUBLIC_API_URL
const headers = { 'X-Store-Id': STORE_ID }
const opts = { headers, next: { revalidate: 60 } }

async function apiFetch<T>(path: string, locale: string): Promise<T[]> {
  try {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${API}${path}${sep}locale=${locale}`, opts)
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch { return [] }
}

async function getFeaturedProducts(locale: string) {
  const featured = await apiFetch<any>('/store/products?featured=true&limit=8', locale)
  if (featured.length > 0) return featured
  return apiFetch<any>('/store/products?limit=8', locale)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const store = await getStoreInfo()
  const name = store?.name ?? 'Store'
  const description = store?.description ?? 'Quality products delivered fast.'
  const alternates = buildAlternates('', locale)
  return {
    title: { absolute: name },
    description,
    alternates,
    openGraph: {
      url: alternates.canonical,
      type: 'website',
      title: name,
      description,
    },
  }
}

function FeaturedProducts({ products, variant = 'grid-4', heading, cardVariant = 'default' }: { products: any[]; variant?: string; heading: string; cardVariant?: string }) {
  if (products.length === 0) {
    return (
      <section data-theme-section="home-featured" className="theme-home-featured max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold mb-8">{heading}</h2>
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">Products coming soon!</p>
        </div>
      </section>
    )
  }

  const gridClass =
    variant === 'grid-2'
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-8'
      : variant === 'bento'
        ? 'grid grid-cols-1 md:grid-cols-3 gap-3'
        : variant === 'carousel'
          ? 'flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scroll-smooth [&::-webkit-scrollbar]:hidden'
          : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'

  const containerClass = variant === 'grid-2' ? 'max-w-6xl' : 'max-w-7xl'

  return (
    <section data-theme-section="home-featured" data-variant={variant} className={`theme-home-featured ${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-16`}>
      <h2 className="text-2xl font-bold mb-8">{heading}</h2>
      <div data-theme-section="product-grid" data-variant={variant} className={`theme-product-grid ${gridClass}`}>
        {products.map((p: any, i: number) => (
          <div
            key={p.id}
            className={
              variant === 'bento' && i === 0
                ? 'md:col-span-2 md:row-span-2'
                : variant === 'carousel'
                  ? 'flex-shrink-0 w-64 sm:w-72 snap-start'
                  : ''
            }
          >
            <ProductCard product={p} variant={cardVariant} />
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const { sections } = await getThemeConfig(locale)

  const needsTypes = new Set(sections.home.map((s) => s.type))

  const [t, featuredProducts, categories, newArrivals, bestSellers, blogPosts, store] = await Promise.all([
    getTranslations('home'),
    needsTypes.has('featured-products') ? getFeaturedProducts(locale) : Promise.resolve([]),
    needsTypes.has('categories') ? apiFetch<any>('/store/categories', locale) : Promise.resolve([]),
    needsTypes.has('new-arrivals') ? apiFetch<any>('/store/products?sort=createdAt_desc&limit=8', locale) : Promise.resolve([]),
    needsTypes.has('best-sellers') ? apiFetch<any>('/store/products/collection/best-sellers?limit=8', locale) : Promise.resolve([]),
    needsTypes.has('blog-posts') ? apiFetch<any>('/store/blog?limit=4', locale) : Promise.resolve([]),
    needsTypes.has('hero') ? getStoreInfo() : Promise.resolve(null),
  ])

  return (
    <>
      {sections.home.map((section: HomeSection, index: number) => {
        const key = `${section.type}-${index}`
        switch (section.type) {
          case 'hero':
            return (
              <HeroBanner
                key={key}
                variant={section.variant}
                headline={store?.heroHeadline}
                subtext={store?.heroSubtext}
                ctaText={store?.heroCtaText}
                ctaLink={store?.heroCtaLink}
                bannerUrl={store?.heroBannerUrl}
              />
            )
          case 'featured-products':
            return (
              <FeaturedProducts
                key={key}
                products={featuredProducts}
                variant={section.variant}
                heading={section.heading ?? t('featured')}
                cardVariant={sections.productCard}
              />
            )
          case 'newsletter':
            return <NewsletterSection key={key} variant={section.variant} />
          case 'brand-statement':
            return <BrandStatement key={key} />
          case 'categories':
            return <CategoriesSection key={key} categories={categories} variant={section.variant} heading={section.heading} />
          case 'testimonials':
            return <TestimonialsSection key={key} items={section.items as any} heading={section.heading} variant={section.variant} />
          case 'trust-badges':
            return <TrustBadgesSection key={key} items={section.items as any} variant={section.variant} />
          case 'promo-banner':
            return <PromoBannerSection key={key} text={section.text} cta={section.cta} variant={section.variant} imageUrl={section.imageUrl} />
          case 'image-with-text':
            return <ImageWithTextSection key={key} heading={section.heading} text={section.text} cta={section.cta} imageUrl={section.imageUrl} imagePosition={section.imagePosition} />
          case 'brand-logos':
            return <BrandLogosSection key={key} items={section.items as any} heading={section.heading} />
          case 'new-arrivals':
            return <NewArrivalsSection key={key} products={newArrivals} heading={section.heading} variant={section.variant} cardVariant={sections.productCard} />
          case 'best-sellers':
            return <BestSellersSection key={key} products={bestSellers} heading={section.heading} variant={section.variant} cardVariant={sections.productCard} />
          case 'countdown':
            return <CountdownSection key={key} heading={section.heading} text={section.text} cta={section.cta} targetDate={section.targetDate} />
          case 'faq':
            return <FaqSection key={key} items={section.items as any} heading={section.heading} />
          case 'video':
            return <VideoSection key={key} heading={section.heading} text={section.text} videoUrl={section.videoUrl} />
          case 'blog-posts':
            return <BlogPostsSection key={key} posts={blogPosts} heading={section.heading} variant={section.variant} />
          case 'icon-row':
            return <IconRowSection key={key} items={section.items as any} heading={section.heading} />
          default:
            return null
        }
      })}
    </>
  )
}
