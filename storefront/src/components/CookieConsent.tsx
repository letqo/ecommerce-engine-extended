'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

const COOKIE_NAME = 'cookie_consent'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export type ConsentStatus = 'pending' | 'accepted' | 'rejected'

function getConsent(): ConsentStatus {
  if (typeof document === 'undefined') return 'pending'
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  const value = match?.[1]
  if (value === 'accepted') return 'accepted'
  if (value === 'rejected') return 'rejected'
  return 'pending'
}

function setConsent(status: 'accepted' | 'rejected') {
  document.cookie = `${COOKIE_NAME}=${status}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function useConsent(): ConsentStatus {
  const [status, setStatus] = useState<ConsentStatus>('pending')

  useEffect(() => {
    setStatus(getConsent())

    const handler = () => setStatus(getConsent())
    window.addEventListener('consent-change', handler)
    return () => window.removeEventListener('consent-change', handler)
  }, [])

  return status
}

export default function CookieConsent() {
  const t = useTranslations('cookies')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (getConsent() === 'pending') setVisible(true)
  }, [])

  const respond = useCallback((status: 'accepted' | 'rejected') => {
    setConsent(status)
    setVisible(false)
    window.dispatchEvent(new Event('consent-change'))
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6" data-theme-section="cookie-consent">
      <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-lg p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm text-gray-600">
          <p>
            {t('message')}{' '}
            <Link href="/privacy-policy" className="underline text-gray-900 hover:text-primary">
              {t('learnMore')}
            </Link>
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={() => respond('rejected')}
            className="px-5 py-2 text-sm font-medium border border-gray-300 rounded-btn hover:bg-gray-50 transition-colors"
          >
            {t('reject')}
          </button>
          <button
            onClick={() => respond('accepted')}
            className="px-5 py-2 text-sm font-medium bg-primary text-primary-text rounded-btn hover:bg-primary-hover transition-colors"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
