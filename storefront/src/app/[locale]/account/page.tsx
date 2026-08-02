'use client'
import { useEffect, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useCustomerStore } from '@/stores/customerStore'

export default function AccountPage() {
  const t = useTranslations('account')
  const { customer, token, hydrated, logout, fetchMe } = useCustomerStore()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) {
      router.push('/account/login')
      return
    }
    fetchMe().then(() => setReady(true)).catch(() => {
      logout()
      router.push('/account/login')
    })
  }, [hydrated, token])

  if (!ready || !customer) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>
      <div className="bg-gray-50 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">{t('profile')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('name')}</span>
            <span className="font-medium">{customer.firstName} {customer.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('email')}</span>
            <span className="font-medium">{customer.email}</span>
          </div>
        </div>
      </div>
      <button
        onClick={() => { logout(); router.push('/') }}
        className="text-sm text-red-600 hover:text-red-800 font-medium"
      >
        {t('signOut')}
      </button>
    </div>
  )
}
