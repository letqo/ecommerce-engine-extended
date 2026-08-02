'use client'
import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { api } from '@/lib/api'
import ProductCard from './ProductCard'

interface Product {
  id: string
  slug: string
  title: string
  images?: { url: string }[]
  variants: { price: number; compareAtPrice?: number | null }[]
}

export default function RelatedProducts({ slug }: { slug: string }) {
  const t = useTranslations('product')
  const locale = useLocale()
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    api
      .get<{ success: boolean; data: Product[] }>(`/store/products/${slug}/related?limit=4`, locale)
      .then((res) => setProducts(res.data))
      .catch(() => {})
  }, [slug, locale])

  if (products.length === 0) return null

  return (
    <div data-theme-section="related-products" className="theme-related-products border-t border-gray-200 pt-12 mt-12">
      <h2 className="text-2xl font-bold mb-6">{t('relatedProducts')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}
