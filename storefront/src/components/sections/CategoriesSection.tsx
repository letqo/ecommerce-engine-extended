import Image from 'next/image'
import Link from 'next/link'

export default function CategoriesSection({ categories, variant = 'grid', heading }: { categories: any[]; variant?: string; heading?: string }) {
  if (categories.length === 0) return null

  const isScroll = variant === 'scroll'

  return (
    <section data-theme-section="home-categories" data-variant={variant} className="theme-home-categories max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {heading && <h2 className="text-2xl font-bold mb-8">{heading}</h2>}
      <div className={isScroll
        ? 'flex gap-6 overflow-x-auto pb-4 -mx-4 px-4 scroll-smooth [&::-webkit-scrollbar]:hidden'
        : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'
      }>
        {categories.map((cat: any) => (
          <Link
            key={cat.id}
            href={`/products?category=${cat.slug}`}
            className={`group relative overflow-hidden rounded-card ${isScroll ? 'flex-shrink-0 w-48' : ''}`}
          >
            <div className="aspect-square bg-gray-100 overflow-hidden">
              {cat.imageUrl ? (
                <Image src={cat.imageUrl} alt={cat.name} width={400} height={400} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400 text-4xl font-bold">
                  {cat.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 flex items-end p-4">
              <span className="text-white font-semibold text-sm">{cat.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
