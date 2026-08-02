import type { Metadata } from 'next'
import ContentPage from '@/components/ContentPage'
import { API_URL, STORE_ID, buildAlternates } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const alternates = buildAlternates('/terms-of-service', locale)
  return { title: 'Terms of Service', alternates }
}

async function getData(locale: string) {
  try {
    const res = await fetch(`${API_URL}/store/store/pages/terms-of-service?locale=${locale}`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data
  } catch { return null }
}

export default async function TermsOfServicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const data = await getData(locale)
  return <ContentPage title="Terms of Service" content={data?.termsOfService} />
}
