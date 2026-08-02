'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Star, CheckCircle, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { Link } from '@/i18n/navigation'

interface TokenData {
  productId: string
  productTitle: string
  productSlug: string
  productImage: string | null
  itemTitle: string
}

function Stars({ rating, size = 32, onChange }: { rating: number; size?: number; onChange: (r: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          className="cursor-pointer transition-transform hover:scale-110"
        >
          <Star
            size={size}
            className={`transition-colors ${(hover || rating) >= i ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
          />
        </button>
      ))}
    </div>
  )
}

export default function ReviewTokenClient({ token }: { token: string }) {
  const t = useTranslations('reviews')

  const [data, setData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    api
      .get<{ success: boolean; data: TokenData }>(`/store/reviews/token/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || t('invalidLink')))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await api.post('/store/reviews', { token, rating, title: title || undefined, body: body || undefined })
      setSubmitted(true)
    } catch (err: any) {
      setSubmitError(err.message || 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-100 rounded w-3/4" />
          <div className="h-20 bg-gray-100 rounded" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">{t('invalidLink')}</h1>
        <p className="text-gray-500 mb-6">{error}</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 underline">
          {t('backToStore')}
        </Link>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">{t('thankYou')}</h1>
        <p className="text-gray-500 mb-6">{t('submitted')}</p>
        <Link
          href={`/products/${data?.productSlug}`}
          className="inline-block bg-primary text-primary-text px-6 py-2.5 rounded-btn font-medium hover:bg-primary-hover transition-colors"
        >
          {t('viewProduct')}
        </Link>
      </div>
    )
  }

  return (
    <div data-theme-section="review-form" className="theme-review-form max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">{t('writeReview')}</h1>

      {/* Product card */}
      <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4 mb-8">
        {data?.productImage && (
          <Image
            src={data.productImage}
            alt={data.productTitle}
            width={72}
            height={72}
            className="w-18 h-18 rounded-lg object-cover"
          />
        )}
        <div>
          <p className="font-semibold">{data?.productTitle}</p>
          <p className="text-sm text-gray-500">{data?.itemTitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">{t('rating')} *</label>
          <Stars rating={rating} onChange={setRating} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('reviewTitle')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('reviewTitlePlaceholder')}
            maxLength={120}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('reviewBody')}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('reviewBodyPlaceholder')}
            maxLength={2000}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
          />
        </div>

        {submitError && <p className="text-red-500 text-sm">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || rating === 0}
          className="w-full bg-primary text-primary-text py-3 rounded-btn font-semibold text-base hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  )
}
