import Link from 'next/link'

export default function PromoBannerSection({ text, cta, variant = 'default', imageUrl }: {
  text?: string
  cta?: { label: string; href: string }
  variant?: string
  imageUrl?: string
}) {
  if (!text) return null

  if (variant === 'with-image' && imageUrl) {
    return (
      <section data-theme-section="home-promo" data-variant="with-image" className="theme-home-promo relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-2xl md:text-3xl font-bold text-white mb-4">{text}</p>
          {cta && (
            <Link href={cta.href} className="inline-block bg-white text-gray-900 px-8 py-3 rounded-btn font-semibold hover:bg-gray-100 transition-colors">
              {cta.label}
            </Link>
          )}
        </div>
      </section>
    )
  }

  return (
    <section data-theme-section="home-promo" data-variant="default" className="theme-home-promo bg-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-center gap-4">
        <p className="text-primary-text font-semibold text-center">{text}</p>
        {cta && (
          <Link href={cta.href} className="inline-block bg-white text-gray-900 px-6 py-2 rounded-btn text-sm font-semibold hover:bg-gray-100 transition-colors">
            {cta.label}
          </Link>
        )}
      </div>
    </section>
  )
}
