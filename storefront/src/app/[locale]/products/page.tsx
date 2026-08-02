import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import ProductCard from '@/components/ProductCard'
import ProductFilters from '@/components/ProductFilters'
import ProductsPagination from '@/components/ProductsPagination'
import { buildAlternates, STORE_ID } from '@/lib/seo'
import { getThemeConfig } from '@/themes'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const alternates = buildAlternates('/products', locale)
  return {
    title: 'All Products',
    description: 'Browse our full collection of products.',
    alternates,
    openGraph: {
      url: alternates.canonical,
      type: 'website',
    },
  }
}

async function getProducts(params: Record<string, string | undefined>, locale: string) {
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/store/products`)
    if (params.search) url.searchParams.set('search', params.search)
    if (params.sort) url.searchParams.set('sort', params.sort)
    if (params.minPrice) url.searchParams.set('minPrice', params.minPrice)
    if (params.maxPrice) url.searchParams.set('maxPrice', params.maxPrice)
    if (params.category) url.searchParams.set('category', params.category)
    if (params.tag) url.searchParams.set('tag', params.tag)
    url.searchParams.set('limit', '48')
    url.searchParams.set('page', params.page || '1')
    url.searchParams.set('locale', locale)
    const res = await fetch(url.toString(), {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 30 },
    })
    if (!res.ok) return { products: [], meta: { page: 1, pages: 1 } }
    const json = await res.json()
    return { products: json.data ?? [], meta: json.meta ?? { page: 1, pages: 1 } }
  } catch {
    return { products: [], meta: { page: 1, pages: 1 } }
  }
}

interface DisplayProduct {
  _key: string
  _href?: string
  id: string
  slug: string
  title: string
  images?: { url: string }[]
  variants: { price: number; compareAtPrice?: number | null }[]
}

function expandProducts(products: any[]): DisplayProduct[] {
  const result: DisplayProduct[] = []
  for (const p of products) {
    if (p.listVariantsIndividually && p.variants.length > 1) {
      for (const v of p.variants) {
        const label = Object.values(v.options as Record<string, string>).join(' / ') || v.title
        result.push({
          _key: `${p.id}-${v.id}`,
          _href: `/products/${p.slug}?variant=${v.id}`,
          id: p.id,
          slug: p.slug,
          title: `${p.title} — ${label}`,
          images: v.imageUrl ? [{ url: v.imageUrl }, ...(p.images ?? [])] : p.images,
          variants: [{ price: v.price, compareAtPrice: v.compareAtPrice }],
        })
      }
    } else {
      result.push({ ...p, _key: p.id })
    }
  }
  return result
}

export default async function ProductsPage({
  params: paramsPromise,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ search?: string; sort?: string; minPrice?: string; maxPrice?: string; category?: string; tag?: string; page?: string }>
}) {
  const { locale } = await paramsPromise
  const params = await searchParams
  const [t, { products, meta }, { sections }] = await Promise.all([
    getTranslations('products'),
    getProducts(params, locale),
    getThemeConfig(locale),
  ])
  const displayProducts = expandProducts(products)

  const gridClass =
    sections.productsGrid === 'grid-2'
      ? 'grid-cols-1 sm:grid-cols-2 gap-8'
      : sections.productsGrid === 'grid-3'
        ? 'grid-cols-2 md:grid-cols-3 gap-6'
        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'

  return (
    <div data-theme-section="products-page" className="theme-products-page max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <span className="text-sm text-gray-500">{t('count', { count: meta.total ?? displayProducts.length })}</span>
      </div>

      <Suspense>
        <ProductFilters />
      </Suspense>

      {displayProducts.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <p className="text-lg">{t('notFound')}</p>
        </div>
      ) : (
        <>
          <div data-theme-section="product-grid" data-variant={sections.productsGrid} className={`theme-product-grid grid ${gridClass}`}>
            {displayProducts.map((p) => (
              <ProductCard key={p._key} product={p} href={p._href} variant={sections.productCard} />
            ))}
          </div>
          <Suspense>
            <ProductsPagination page={meta.page ?? 1} pages={meta.pages ?? 1} />
          </Suspense>
        </>
      )}
    </div>
  )
}
