import Image from 'next/image'
import Link from 'next/link'

export default function ImageWithTextSection({ heading, text, cta, imageUrl, imagePosition = 'left' }: {
  heading?: string
  text?: string
  cta?: { label: string; href: string }
  imageUrl?: string
  imagePosition?: 'left' | 'right'
}) {
  if (!heading && !text) return null

  return (
    <section data-theme-section="home-image-text" data-variant={imagePosition} className="theme-home-image-text">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-12 items-center ${imagePosition === 'right' ? '' : ''}`}>
          <div className={imagePosition === 'right' ? 'order-1' : 'order-2 md:order-1'}>
            {imageUrl ? (
              <div className="aspect-[4/3] rounded-card overflow-hidden">
                <Image src={imageUrl} alt={heading ?? ''} width={800} height={600} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-[4/3] rounded-card bg-gray-100" />
            )}
          </div>
          <div className={imagePosition === 'right' ? 'order-2' : 'order-1 md:order-2'}>
            {heading && <h2 className="text-3xl font-bold mb-4">{heading}</h2>}
            {text && <p className="text-gray-600 leading-relaxed mb-6">{text}</p>}
            {cta && (
              <Link href={cta.href} className="inline-block bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors">
                {cta.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
