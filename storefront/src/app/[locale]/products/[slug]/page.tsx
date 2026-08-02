import type { Metadata } from 'next'
import ProductDetailClient from './ProductDetailClient'
import { getStoreInfo, buildAlternates, API_URL, STORE_ID } from '@/lib/seo'

interface ProductData {
  title: string
  description?: string | null
  images: { url: string }[]
  variants: { price: number; compareAtPrice?: number | null }[]
}

async function getProduct(slug: string, locale: string): Promise<ProductData | null> {
  try {
    const res = await fetch(`${API_URL}/store/products/${slug}?locale=${locale}`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data as ProductData | null
  } catch { return null }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}): Promise<Metadata> {
  const { slug, locale } = await params
  const [product, store] = await Promise.all([getProduct(slug, locale), getStoreInfo()])
  if (!product) return { title: 'Product Not Found' }

  const plainDescription = product.description
    ? product.description.replace(/<[^>]+>/g, '').trim().slice(0, 155)
    : `Shop ${product.title} at our store.`

  const alternates = buildAlternates(`/products/${slug}`, locale)

  // 1200×630 is the recommended OG image size for all major platforms
  const ogImages = product.images.map((img) => ({
    url: img.url,
    width: 1200,
    height: 630,
    alt: product.title,
  }))

  return {
    title: product.title,
    description: plainDescription,
    alternates,
    openGraph: {
      title: product.title,
      description: plainDescription,
      url: alternates.canonical,
      images: ogImages,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description: plainDescription,
      images: product.images[0] ? [product.images[0].url] : undefined,
    },
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}) {
  const { slug, locale } = await params
  const [product, store] = await Promise.all([getProduct(slug, locale), getStoreInfo()])

  const currency = store?.currency ?? 'USD'

  const jsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        description: product.description?.replace(/<[^>]+>/g, '').trim() ?? '',
        image: product.images.map((img) => img.url),
        offers: {
          '@type': 'Offer',
          price: product.variants[0]?.price ?? 0,
          priceCurrency: currency,
          availability: 'https://schema.org/InStock',
        },
      }
    : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailClient />
    </>
  )
}
