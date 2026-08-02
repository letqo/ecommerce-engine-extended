'use client'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function ProductsPagination({ page, pages }: { page: number; pages: number }) {
  const t = useTranslations('products')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (pages <= 1) return null

  const goTo = (p: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (p <= 1) params.delete('page')
    else params.set('page', String(p))
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div data-theme-section="products-pagination" className="theme-pagination flex items-center justify-center gap-3 mt-10">
      <button
        onClick={() => goTo(page - 1)}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={15} /> {t('prev')}
      </button>
      <span className="text-sm text-gray-500">{t('pageOf', { page, pages })}</span>
      <button
        onClick={() => goTo(page + 1)}
        disabled={page >= pages}
        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {t('next')} <ChevronRight size={15} />
      </button>
    </div>
  )
}
