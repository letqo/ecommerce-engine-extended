export const STORE_URL = process.env.NEXT_PUBLIC_STORE_URL ?? 'http://localhost:3000'
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
export const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? ''
export const LOCALES = ['en', 'fr', 'de', 'it', 'es'] as const

export interface StoreInfo {
  name: string
  description?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  currency: string
  primaryColor: string
  announcementActive?: boolean
  announcementText?: string | null
  announcementLink?: string | null
  heroHeadline?: string | null
  heroSubtext?: string | null
  heroCtaText?: string | null
  heroCtaLink?: string | null
  heroBannerUrl?: string | null
  heroBannerUrls?: string[] | null
  targetMarkets?: string[]
  shipToCountry?: string
}

export async function getStoreInfo(): Promise<StoreInfo | null> {
  try {
    const res = await fetch(`${API_URL}/store/store/info`, {
      headers: { 'X-Store-Id': STORE_ID },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data as StoreInfo | null
  } catch { return null }
}

// Builds the canonical URL + hreflang alternates for a given path and locale.
// path must start with '/' or be '' for the home page.
// Example: buildAlternates('/products/my-shoe', 'fr')
export function buildAlternates(path: string, locale: string) {
  const canonical = `${STORE_URL}/${locale}${path}`
  const languages: Record<string, string> = Object.fromEntries(
    LOCALES.map((loc) => [loc, `${STORE_URL}/${loc}${path}`])
  )
  languages['x-default'] = `${STORE_URL}/en${path}`
  return { canonical, languages }
}
