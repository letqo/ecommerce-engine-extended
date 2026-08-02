'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { Heart } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'
import { useWishlistStore } from '@/stores/wishlistStore'

interface Product {
  id: string
  slug: string
  title: string
  images?: { url: string }[]
  variants: { price: number; compareAtPrice?: number | null }[]
}

export default function ProductCard({ product, href, variant = 'default' }: { product: Product; href?: string; variant?: string }) {
  const image = product.images?.[0]?.url ?? '/placeholder.jpg'
  const defaultVariant = product.variants?.[0]
  const price = defaultVariant?.price ?? 0
  const compareAt = defaultVariant?.compareAtPrice
  const currency = useCurrency()

  const { add, remove, has } = useWishlistStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const inWishlist = mounted && has(product.id)

  const toggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inWishlist) {
      remove(product.id)
    } else {
      add({
        productId: product.id,
        slug: product.slug,
        title: product.title,
        image,
        price,
        compareAtPrice: compareAt,
      })
    }
  }

  if (variant === 'overlay') {
    return (
      <Link href={href ?? `/products/${product.slug}`} data-theme-section="product-card" data-variant="overlay" className="theme-product-card group block">
        <div className="theme-card-image relative aspect-square overflow-hidden rounded-xl bg-gray-100">
          <Image
            src={image}
            alt={product.title}
            width={400}
            height={400}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <button
            onClick={toggleWishlist}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors z-10"
          >
            <Heart
              size={16}
              className={inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-600'}
            />
          </button>
          <div className="theme-slot theme-slot-card-badge" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="theme-card-title font-medium text-white text-sm truncate">{product.title}</h3>
            <div className="theme-card-price flex items-center gap-2 mt-1">
              <span className="font-semibold text-white">{formatPrice(price, currency)}</span>
              {compareAt != null && compareAt > 0 && compareAt > price && (
                <span className="theme-card-compare-price text-sm text-white/70 line-through">{formatPrice(compareAt, currency)}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    )
  }

  if (variant === 'detailed') {
    return (
      <Link href={href ?? `/products/${product.slug}`} data-theme-section="product-card" data-variant="detailed" className="theme-product-card group block">
        <div className="theme-card-image relative aspect-square overflow-hidden rounded-xl bg-gray-100 mb-3">
          <Image
            src={image}
            alt={product.title}
            width={400}
            height={400}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <button
            onClick={toggleWishlist}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors z-10"
          >
            <Heart
              size={16}
              className={inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-600'}
            />
          </button>
          <div className="theme-slot theme-slot-card-badge" aria-hidden="true" />
        </div>
        <h3 className="theme-card-title font-medium text-gray-900 text-sm truncate">{product.title}</h3>
        <div className="theme-card-price flex items-center gap-2 mt-1">
          <span className="font-semibold text-gray-900">{formatPrice(price, currency)}</span>
          {compareAt != null && compareAt > 0 && compareAt > price && (
            <span className="theme-card-compare-price text-sm text-gray-400 line-through">{formatPrice(compareAt, currency)}</span>
          )}
        </div>
        <div className="theme-card-rating flex items-center gap-1 mt-1">
          <span className="text-xs text-yellow-500">★★★★★</span>
        </div>
        <button className="theme-card-action mt-2 w-full py-1.5 text-xs font-medium border border-gray-300 rounded-btn hover:bg-gray-50 transition-colors">
          Quick View
        </button>
      </Link>
    )
  }

  // Default variant
  return (
    <Link href={href ?? `/products/${product.slug}`} data-theme-section="product-card" data-variant={variant} className="theme-product-card group block">
      <div className="theme-card-image relative aspect-square overflow-hidden rounded-xl bg-gray-100 mb-3">
        <Image
          src={image}
          alt={product.title}
          width={400}
          height={400}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <button
          onClick={toggleWishlist}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors z-10"
        >
          <Heart
            size={16}
            className={inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-600'}
          />
        </button>
        <div className="theme-slot theme-slot-card-badge" aria-hidden="true" />
      </div>
      <h3 className="theme-card-title font-medium text-gray-900 text-sm truncate">{product.title}</h3>
      <div className="theme-card-price flex items-center gap-2 mt-1">
        <span className="font-semibold text-gray-900">{formatPrice(price, currency)}</span>
        {compareAt != null && compareAt > 0 && compareAt > price && (
          <span className="theme-card-compare-price text-sm text-gray-400 line-through">{formatPrice(compareAt, currency)}</span>
        )}
      </div>
    </Link>
  )
}
