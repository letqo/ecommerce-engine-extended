'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Star } from 'lucide-react'
import { api } from '@/lib/api'

interface Review {
  id: string
  authorName: string
  rating: number
  title: string | null
  body: string | null
  createdAt: string
}

interface ReviewMeta {
  total: number
  page: number
  pages: number
  averageRating: number
  totalReviews: number
  distribution: Record<number, number>
}

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={`${rating >= i ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
        />
      ))}
    </div>
  )
}

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-6 text-right text-gray-600">{stars}</span>
      <Star size={12} className="fill-yellow-400 text-yellow-400 flex-shrink-0" />
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-gray-500 text-xs">{count}</span>
    </div>
  )
}

export default function ReviewSection({ productId }: { productId: string }) {
  const t = useTranslations('reviews')

  const [reviews, setReviews] = useState<Review[]>([])
  const [meta, setMeta] = useState<ReviewMeta | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchReviews = (p: number, append = false) => {
    setLoading(true)
    api
      .get<{ success: boolean; data: Review[]; meta: ReviewMeta }>(`/store/reviews/${productId}?page=${p}&limit=5`)
      .then((res) => {
        setReviews((prev) => (append ? [...prev, ...res.data] : res.data))
        setMeta(res.meta)
        setPage(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReviews(1) }, [productId])

  const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div data-theme-section="reviews" className="theme-reviews max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-200">
      <h2 className="text-2xl font-bold mb-8">{t('title')}</h2>

      {meta && meta.totalReviews > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-5xl font-bold">{meta.averageRating}</div>
              <Stars rating={Math.round(meta.averageRating)} size={20} />
              <p className="text-sm text-gray-500 mt-1">{t('totalReviews', { count: meta.totalReviews })}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <RatingBar key={s} stars={s} count={meta.distribution[s] || 0} total={meta.totalReviews} />
            ))}
          </div>
        </div>
      )}

      {/* Review list */}
      {reviews.length === 0 && !loading ? (
        <p className="text-gray-500">{t('noReviews')}</p>
      ) : (
        <div className="space-y-6">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-gray-100 pb-6">
              <div className="flex items-center gap-3 mb-2">
                <Stars rating={r.rating} size={14} />
                {r.title && <span className="font-semibold text-sm">{r.title}</span>}
              </div>
              {r.body && <p className="text-gray-600 text-sm leading-relaxed mb-2">{r.body}</p>}
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="font-medium text-gray-500">{r.authorName}</span>
                <span>&middot;</span>
                <span>{formatDate(r.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && page < meta.pages && (
        <button
          onClick={() => fetchReviews(page + 1, true)}
          disabled={loading}
          className="mt-6 text-sm font-medium text-gray-600 hover:text-gray-900 underline"
        >
          {t('showMore')}
        </button>
      )}
    </div>
  )
}
