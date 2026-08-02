import type { MetadataRoute } from 'next'
import { API_URL, STORE_ID, STORE_URL, LOCALES } from '@/lib/seo'

async function getAllProducts() {
  try {
    const res = await fetch(`${API_URL}/store/products?limit=1000`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []) as { slug: string; updatedAt?: string; createdAt: string }[]
  } catch {
    return []
  }
}

async function getAllBlogPosts() {
  try {
    const res = await fetch(`${API_URL}/store/blog?limit=1000`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []) as { slug: string; publishedAt?: string }[]
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, posts] = await Promise.all([getAllProducts(), getAllBlogPosts()])

  const staticEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    {
      url: `${STORE_URL}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${STORE_URL}/${locale}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${STORE_URL}/${locale}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
  ])

  const productEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) =>
    products.map((p) => ({
      url: `${STORE_URL}/${locale}/products/${p.slug}`,
      lastModified: new Date(p.updatedAt ?? p.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  )

  const blogEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) =>
    posts.map((p) => ({
      url: `${STORE_URL}/${locale}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt ?? new Date()),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  )

  return [...staticEntries, ...productEntries, ...blogEntries]
}
