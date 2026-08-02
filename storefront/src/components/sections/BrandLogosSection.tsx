import Image from 'next/image'

interface BrandLogo {
  src: string
  alt: string
  href?: string
}

export default function BrandLogosSection({ items = [], heading }: { items?: BrandLogo[]; heading?: string }) {
  if (items.length === 0) return null

  return (
    <section data-theme-section="home-logos" className="theme-home-logos py-12 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {heading && <p className="text-center text-sm text-gray-500 font-medium mb-8 uppercase tracking-wider">{heading}</p>}
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14">
          {items.map((logo, i) => {
            const img = (
              <Image
                src={logo.src}
                alt={logo.alt}
                width={120}
                height={48}
                className="h-8 md:h-10 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
              />
            )
            return logo.href ? (
              <a key={i} href={logo.href} target="_blank" rel="noopener noreferrer">{img}</a>
            ) : (
              <div key={i}>{img}</div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
