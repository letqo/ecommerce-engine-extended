'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'

function UnsubscribeInner() {
  const t = useTranslations('unsubscribe')
  const params = useSearchParams()
  const token = params?.get('token') ?? null
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    api.get(`/store/newsletter/unsubscribe?token=${token}`)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  if (status === 'loading') {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      {status === 'success' ? (
        <>
          <CheckCircle2 size={72} className="mx-auto text-green-500 mb-6" />
          <h1 className="text-3xl font-bold mb-3">{t('title')}</h1>
          <p className="text-gray-600 mb-10">{t('message')}</p>
        </>
      ) : (
        <>
          <XCircle size={72} className="mx-auto text-red-500 mb-6" />
          <h1 className="text-3xl font-bold mb-3">{t('errorTitle')}</h1>
          <p className="text-gray-600 mb-10">{t('errorMessage')}</p>
        </>
      )}
      <Link href="/products" className="inline-block bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors">
        {t('continue')}
      </Link>
    </div>
  )
}

export default function UnsubscribePage() {
  return <Suspense><UnsubscribeInner /></Suspense>
}
