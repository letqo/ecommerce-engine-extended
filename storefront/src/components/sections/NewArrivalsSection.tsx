import ProductCard from '@/components/ProductCard'

export default function NewArrivalsSection({ products, heading, variant = 'grid-4', cardVariant = 'default' }: {
  products: any[]
  heading?: string
  variant?: string
  cardVariant?: string
}) {
  if (products.length === 0) return null

  const gridClass =
    variant === 'grid-2'
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-8'
      : variant === 'carousel'
        ? 'flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scroll-smooth [&::-webkit-scrollbar]:hidden'
        : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'

  return (
    <section data-theme-section="home-new-arrivals" data-variant={variant} className="theme-home-new-arrivals max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h2 className="text-2xl font-bold mb-8">{heading ?? 'New Arrivals'}</h2>
      <div className={gridClass}>
        {products.map((p: any) => (
          <div key={p.id} className={variant === 'carousel' ? 'flex-shrink-0 w-64 sm:w-72 snap-start' : ''}>
            <ProductCard product={p} variant={cardVariant} />
          </div>
        ))}
      </div>
    </section>
  )
}
