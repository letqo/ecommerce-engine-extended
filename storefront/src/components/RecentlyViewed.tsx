'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRecentlyViewedStore } from '@/stores/recentlyViewedStore'
import ProductCard from './ProductCard'

export default function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const t = useTranslations('product')
  const items = useRecentlyViewedStore((s) => s.items)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const filtered = items.filter((i) => i.productId !== excludeId)
  if (filtered.length === 0) return null

  return (
    <div data-theme-section="recently-viewed" className="theme-recently-viewed border-t border-gray-200 pt-12 mt-12">
      <h2 className="text-2xl font-bold mb-6">{t('recentlyViewed')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {filtered.slice(0, 6).map((item) => (
          <ProductCard
            key={item.productId}
            product={{
              id: item.productId,
              slug: item.slug,
              title: item.title,
              images: item.image ? [{ url: item.image }] : [],
              variants: [{ price: item.price, compareAtPrice: item.compareAtPrice }],
            }}
          />
        ))}
      </div>
    </div>
  )
}
