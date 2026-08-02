import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const storeUrl = process.env.NEXT_PUBLIC_STORE_URL ?? 'http://localhost:3000'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/checkout', '/account', '/order-confirmation', '/cart'],
      },
    ],
    sitemap: `${storeUrl}/sitemap.xml`,
  }
}
