'use client'
import { useState, useEffect } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import { useCustomerStore } from '@/stores/customerStore'

export default function RegisterPage() {
  const t = useTranslations('register')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, customer, hydrated } = useCustomerStore()
  const router = useRouter()

  useEffect(() => {
    if (hydrated && customer) router.push('/account')
  }, [hydrated, customer])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/store/auth/register', form)
      await login(form.email, form.password)
      router.push('/account')
    } catch (err: any) {
      setError(err.message ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">{t('title')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('firstName')}</label>
              <input value={form.firstName} onChange={set('firstName')} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('lastName')}</label>
              <input value={form.lastName} onChange={set('lastName')} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
            <input type="email" value={form.email} onChange={set('email')} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-primary text-primary-text py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          {t('hasAccount')}{' '}
          <Link href="/account/login" className="text-black font-medium hover:underline">{t('signIn')}</Link>
        </p>
      </div>
    </div>
  )
}
