import type { Metadata } from 'next'
import { API_URL, STORE_ID, buildAlternates } from '@/lib/seo'
import { Mail, Phone, MapPin } from 'lucide-react'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const alternates = buildAlternates('/contact', locale)
  return { title: 'Contact Us', alternates }
}

async function getData() {
  try {
    const res = await fetch(`${API_URL}/store/store/pages/contact`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data
  } catch { return null }
}

export default async function ContactPage() {
  const data = await getData()

  return (
    <div data-theme-section="content-page" className="theme-content-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="theme-content-title text-3xl font-bold text-gray-900 mb-8">Contact Us</h1>

      <div className="theme-content-body space-y-6">
        {data?.contactEmail && (
          <div className="flex items-start gap-4">
            <Mail size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-500">Email</p>
              <a href={`mailto:${data.contactEmail}`} className="text-gray-900 hover:text-primary transition-colors">
                {data.contactEmail}
              </a>
            </div>
          </div>
        )}

        {data?.contactPhone && (
          <div className="flex items-start gap-4">
            <Phone size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-500">Phone</p>
              <a href={`tel:${data.contactPhone}`} className="text-gray-900 hover:text-primary transition-colors">
                {data.contactPhone}
              </a>
            </div>
          </div>
        )}

        {data?.address && (
          <div className="flex items-start gap-4">
            <MapPin size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-500">Address</p>
              <p className="text-gray-900 whitespace-pre-line">{data.address}</p>
            </div>
          </div>
        )}

        {!data?.contactEmail && !data?.contactPhone && !data?.address && (
          <p className="text-gray-400">Contact information has not been set up yet.</p>
        )}
      </div>
    </div>
  )
}
