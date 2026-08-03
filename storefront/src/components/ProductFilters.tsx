'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { SlidersHorizontal, X } from 'lucide-react'
import { api } from '@/lib/api'

const SORT_OPTIONS = [
  { value: 'createdAt_desc', labelKey: 'newest' },
  { value: 'price_asc', labelKey: 'priceLow' },
  { value: 'price_desc', labelKey: 'priceHigh' },
  { value: 'title_asc', labelKey: 'nameAZ' },
  { value: 'title_desc', labelKey: 'nameZA' },
]

interface Category {
  id: string
  name: string
  slug: string
  children?: Category[]
}

export default function ProductFilters() {
  const t = useTranslations('products')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSort = searchParams?.get('sort') ?? 'createdAt_desc'
  const currentSearch = searchParams?.get('search') ?? ''
  const currentMinPrice = searchParams?.get('minPrice') ?? ''
  const currentMaxPrice = searchParams?.get('maxPrice') ?? ''
  const currentCategory = searchParams?.get('category') ?? ''

  const [minPrice, setMinPrice] = useState(currentMinPrice)
  const [maxPrice, setMaxPrice] = useState(currentMaxPrice)
  const [showFilters, setShowFilters] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  const hasActiveFilters = currentSearch || currentMinPrice || currentMaxPrice || currentSort !== 'createdAt_desc' || currentCategory

  useEffect(() => {
    api.get<{ success: boolean; data: Category[] }>('/store/categories', locale)
      .then((res) => setCategories(res.data))
      .catch(() => {})
  }, [locale])

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    params.delete('page')
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ sort: e.target.value === 'createdAt_desc' ? null : e.target.value })
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ category: e.target.value || null })
  }

  const handlePriceApply = () => {
    updateParams({
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
    })
  }

  const handleClearAll = () => {
    setMinPrice('')
    setMaxPrice('')
    router.push(pathname)
  }

  return (
    <div data-theme-section="product-filters" className="theme-product-filters mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {currentSearch && (
            <div className="theme-filter-search-tag flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-sm">
              <span>&ldquo;{currentSearch}&rdquo;</span>
              <button onClick={() => updateParams({ search: null })} className="hover:text-gray-900">
                <X size={14} />
              </button>
            </div>
          )}

          {currentCategory && (
            <div className="theme-filter-category-tag flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-sm">
              <span>{categories.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.slug === currentCategory)?.name ?? currentCategory}</span>
              <button onClick={() => updateParams({ category: null })} className="hover:text-gray-900">
                <X size={14} />
              </button>
            </div>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="theme-filter-toggle inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 transition-colors"
          >
            <SlidersHorizontal size={15} />
            {t('filters')}
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleClearAll}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('clearAll')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {categories.length > 0 && (
            <select
              value={currentCategory}
              onChange={handleCategoryChange}
              className="theme-category-select text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  <option value={cat.slug}>{cat.name}</option>
                  {cat.children?.map((child) => (
                    <option key={child.id} value={child.slug}>{'  '}{child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          <select
            value={currentSort}
            onChange={handleSortChange}
            className="theme-sort-select text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      {showFilters && (
        <div className="theme-filter-panel mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('minPrice')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className="theme-filter-input w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('maxPrice')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="999"
                className="theme-filter-input w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handlePriceApply}
              className="theme-filter-apply px-4 py-1.5 bg-primary text-primary-text rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              {t('apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
