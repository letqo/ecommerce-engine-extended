'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { Heart, Trash2, ShoppingBag } from 'lucide-react'
import { useWishlistStore } from '@/stores/wishlistStore'
import { useCartStore } from '@/stores/cartStore'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'
import { api } from '@/lib/api'

interface VariantData {
  id: string
  price: number
  isDefault: boolean
}

export default function WishlistPage() {
  const t = useTranslations('wishlist')
  const currency = useCurrency()
  const { items, remove } = useWishlistStore()
  const addToCart = useCartStore((s) => s.addItem)
  const [mounted, setMounted] = useState(false)
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({})
  useEffect(() => setMounted(true), [])

  const handleAddToCart = async (item: typeof items[0]) => {
    try {
      const res = await api.get<{ success: boolean; data: { variants: VariantData[] } }>(`/store/products/${item.slug}`)
      const variant = res.data.variants.find((v) => v.isDefault) ?? res.data.variants[0]
      if (!variant) return
      addToCart({
        variantId: variant.id,
        productId: item.productId,
        name: item.title,
        image: item.image,
        price: variant.price,
        quantity: 1,
      })
      setAddedMap((m) => ({ ...m, [item.productId]: true }))
      setTimeout(() => setAddedMap((m) => ({ ...m, [item.productId]: false })), 2000)
    } catch {}
  }

  if (!mounted) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-1/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-theme-section="wishlist" className="theme-wishlist max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <span className="text-sm text-gray-500">{t('count', { count: items.length })}</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-24">
          <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg text-gray-500 mb-2">{t('empty')}</p>
          <p className="text-sm text-gray-400 mb-6">{t('emptySub')}</p>
          <Link
            href="/products"
            className="inline-block bg-primary text-primary-text px-6 py-2.5 rounded-btn font-medium hover:bg-primary-hover transition-colors"
          >
            {t('shopNow')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div key={item.productId} className="group">
              <Link href={`/products/${item.slug}`} className="block">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100 mb-3">
                  <Image
                    src={item.image || '/placeholder.jpg'}
                    alt={item.title}
                    width={400}
                    height={400}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              </Link>
              <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-semibold text-gray-900">{formatPrice(item.price, currency)}</span>
                {item.compareAtPrice != null && item.compareAtPrice > item.price && (
                  <span className="text-sm text-gray-400 line-through">{formatPrice(item.compareAtPrice, currency)}</span>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAddToCart(item)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-text py-2 rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <ShoppingBag size={14} />
                  {addedMap[item.productId] ? t('added') : t('addToCart')}
                </button>
                <button
                  onClick={() => remove(item.productId)}
                  className="w-9 flex items-center justify-center border border-gray-300 rounded-btn text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
