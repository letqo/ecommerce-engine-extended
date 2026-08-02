'use client'
import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'

function Confirmation() {
  const t = useTranslations('confirmation')
  const params = useSearchParams()
  const paymentIntent = params?.get('payment_intent') ?? null
  const clearCart = useCartStore((s) => s.clear)

  useEffect(() => { clearCart() }, [])

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <CheckCircle2 size={72} className="mx-auto text-green-500 mb-6" />
      <h1 className="text-3xl font-bold mb-3">{t('title')}</h1>
      <p className="text-gray-600 mb-2">{t('subtitle')}</p>
      {paymentIntent && (
        <p className="text-sm text-gray-400 mb-8 font-mono">Ref: {paymentIntent.slice(-8).toUpperCase()}</p>
      )}
      <p className="text-gray-500 mb-10">{t('message')}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/track-order" className="inline-block bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors">
          {t('trackOrder')}
        </Link>
        <Link href="/products" className="inline-block border border-gray-300 text-gray-700 px-8 py-3 rounded-btn font-semibold hover:bg-gray-50 transition-colors">
          {t('continue')}
        </Link>
      </div>
    </div>
  )
}

export default function OrderConfirmationPage() {
  return <Suspense><Confirmation /></Suspense>
}
