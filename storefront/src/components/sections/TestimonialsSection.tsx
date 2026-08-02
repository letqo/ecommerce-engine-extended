'use client'
import { useState } from 'react'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'

interface Testimonial {
  name: string
  text: string
  rating?: number
  avatar?: string
}

export default function TestimonialsSection({ items = [], heading, variant = 'grid' }: { items?: Testimonial[]; heading?: string; variant?: string }) {
  const [current, setCurrent] = useState(0)

  if (items.length === 0) return null

  const isCarousel = variant === 'carousel'

  if (isCarousel) {
    const item = items[current]
    return (
      <section data-theme-section="home-testimonials" data-variant="carousel" className="theme-home-testimonials bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          {heading && <h2 className="text-2xl font-bold mb-10">{heading}</h2>}
          <div className="flex items-center gap-2 justify-center mb-4">
            {Array.from({ length: item.rating ?? 5 }).map((_, i) => (
              <Star key={i} size={18} className="fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-lg text-gray-700 italic mb-6">&ldquo;{item.text}&rdquo;</p>
          <p className="font-semibold text-sm text-gray-900">{item.name}</p>
          {items.length > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button onClick={() => setCurrent((current - 1 + items.length) % items.length)} className="p-2 rounded-full border border-gray-300 hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-500">{current + 1} / {items.length}</span>
              <button onClick={() => setCurrent((current + 1) % items.length)} className="p-2 rounded-full border border-gray-300 hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section data-theme-section="home-testimonials" data-variant="grid" className="theme-home-testimonials bg-gray-50 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {heading && <h2 className="text-2xl font-bold mb-10 text-center">{heading}</h2>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-card p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: item.rating ?? 5 }).map((_, j) => (
                  <Star key={j} size={14} className="fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-700 text-sm mb-4">&ldquo;{item.text}&rdquo;</p>
              <p className="font-semibold text-sm">{item.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
