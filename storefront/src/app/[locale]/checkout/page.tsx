'use client'
import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslations, useLocale } from 'next-intl'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCartStore } from '@/stores/cartStore'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'
import { ChevronDown } from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const schema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(2),
})

type FormData = z.infer<typeof schema>

function CheckoutForm({ clientSecret, formData, onBack }: {
  clientSecret: string
  formData: FormData
  onBack: () => void
}) {
  const t = useTranslations('checkout')
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError('')
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation`,
        receipt_email: formData.email,
      },
    })
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-4">
        <button type="button" onClick={onBack} className="flex-1 border border-gray-300 py-3 rounded-btn font-semibold hover:bg-gray-50 transition-colors">
          {t('back')}
        </button>
        <button type="submit" disabled={loading || !stripe} className="flex-1 bg-primary text-primary-text py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
          {loading ? t('processing') : t('pay')}
        </button>
      </div>
    </form>
  )
}

export default function CheckoutPage() {
  const t = useTranslations('checkout')
  const locale = useLocale()
  const currency = useCurrency()
  const { items } = useCartStore()
  const router = useRouter()
  const [step, setStep] = useState<'info' | 'payment'>('info')
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedForm, setSavedForm] = useState<FormData | null>(null)
  const [checkoutLayout, setCheckoutLayout] = useState<'two-column' | 'single-column'>('two-column')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [deliveryEstimate, setDeliveryEstimate] = useState<{ min: number; max: number } | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [parcelCount, setParcelCount] = useState(1)
  const [shipCountries, setShipCountries] = useState<{ code: string; label: string }[]>([])

  const [couponCode, setCouponCode] = useState('')
  const [couponApplying, setCouponApplying] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; discountAmount: number } | null>(null)

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const total = appliedCoupon ? Math.max(0, subtotal - appliedCoupon.discountAmount) : subtotal

  useEffect(() => {
    const layout = document.body.dataset.checkoutLayout
    if (layout === 'single-column') setCheckoutLayout('single-column')
  }, [])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { country: '' },
  })

  const watchedCountry = watch('country')

  // Country list is driven entirely by the store's configured target markets
  // (Settings → Target markets) — nothing hardcoded, so it stays correct as
  // markets are added/removed there. Falls back to shipToCountry if a store
  // has no target markets configured yet, so the field is never empty.
  useEffect(() => {
    api.get<{ success: boolean; data: { targetMarkets?: string[]; shipToCountry?: string } }>('/store/store/info')
      .then((res) => {
        const shipToCountry = res.data.shipToCountry
        const codes = res.data.targetMarkets?.length ? res.data.targetMarkets : [shipToCountry ?? 'US']
        let regionNames: Intl.DisplayNames | null = null
        try { regionNames = new Intl.DisplayNames([locale], { type: 'region' }) } catch {}
        const list = codes
          .map((code) => ({ code, label: regionNames?.of(code) ?? code }))
          .sort((a, b) => a.label.localeCompare(b.label))
        setShipCountries(list)
        setValue('country', shipToCountry && codes.includes(shipToCountry) ? shipToCountry : codes[0])
      })
      .catch(() => setShipCountries([{ code: 'US', label: 'United States' }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const country = watchedCountry?.trim()
    if (!country || country.length < 2 || items.length === 0) {
      setDeliveryEstimate(null)
      return
    }
    setDeliveryLoading(true)
    const t = setTimeout(() => {
      api.post<{ success: boolean; data: { deliveryMinDays?: number; deliveryMaxDays?: number; parcelCount?: number } }>(
        '/store/checkout/delivery-estimate',
        { items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), country }
      )
        .then((res) => {
          const { deliveryMinDays, deliveryMaxDays, parcelCount: pc } = res.data
          setDeliveryEstimate(
            deliveryMinDays != null ? { min: deliveryMinDays, max: deliveryMaxDays ?? deliveryMinDays } : null
          )
          setParcelCount(pc ?? 1)
        })
        .catch(() => setDeliveryEstimate(null))
        .finally(() => setDeliveryLoading(false))
    }, 600)
    return () => { clearTimeout(t); setDeliveryLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCountry])

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponApplying(true)
    setCouponError('')
    try {
      const res = await api.post<{ success: boolean; data: { valid: boolean; reason?: string; discountAmount?: number; label?: string } }>(
        '/store/checkout/validate-coupon',
        { code: couponCode.trim(), subtotal }
      )
      if (res.data.valid) {
        setAppliedCoupon({ code: couponCode.trim().toUpperCase(), label: res.data.label!, discountAmount: res.data.discountAmount! })
        setCouponError('')
      } else {
        setCouponError(res.data.reason || 'Invalid coupon')
      }
    } catch {
      setCouponError('Could not validate coupon')
    } finally {
      setCouponApplying(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError('')
  }

  const onInfoSubmit = async (data: FormData) => {
    if (items.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ success: boolean; data: { clientSecret: string; orderId: string } }>(
        '/store/checkout/payment-intent',
        {
          email: data.email,
          shippingAddress: {
            firstName: data.firstName,
            lastName: data.lastName,
            address1: data.address,
            city: data.city,
            province: data.state,
            postalCode: data.zip,
            country: data.country,
          },
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          couponCode: appliedCoupon?.code,
        }
      )
      setClientSecret(res.data.clientSecret)
      setSavedForm(data)
      setStep('payment')
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) { router.push('/cart'); return null }

  const field = (label: string, name: keyof FormData, placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input {...register(name)} placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name]!.message as string}</p>}
    </div>
  )

  const isSingleColumn = checkoutLayout === 'single-column'

  const deliveryRangeText = (() => {
    if (!deliveryEstimate) return null
    const now = new Date()
    const fmt = (d: Date) => d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
    const minDate = new Date(now.getTime() + deliveryEstimate.min * 86400000)
    const maxDate = new Date(now.getTime() + deliveryEstimate.max * 86400000)
    return `${fmt(minDate)} – ${fmt(maxDate)}`
  })()

  const summaryBlock = (
    <div className={isSingleColumn ? '' : 'bg-gray-50 rounded-2xl p-6'}>
      <h2 className={isSingleColumn ? 'sr-only' : 'font-bold mb-4'}>{t('summary')}</h2>
      <div className="space-y-3 mb-4">
        {items.map((i) => (
          <div key={i.variantId} className="flex justify-between text-sm">
            <span className="text-gray-600 truncate mr-2">{i.name} × {i.quantity}</span>
            <span className="font-medium">{formatPrice(i.price * i.quantity, currency)}</span>
          </div>
        ))}
      </div>

      <div className="border-t pt-4 space-y-3">
        {!appliedCoupon ? (
          <div>
            <div className="flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder={t('couponPlaceholder')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon() } }}
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={couponApplying || !couponCode.trim()}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {couponApplying ? t('applying') : t('apply')}
              </button>
            </div>
            {couponError && <p className="text-xs text-red-600">{couponError}</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <div>
              <span className="text-sm font-medium text-green-800">{appliedCoupon.code}</span>
              <span className="text-xs text-green-600 ml-2">({appliedCoupon.label})</span>
            </div>
            <button type="button" onClick={removeCoupon} className="text-xs text-red-600 hover:text-red-800 font-medium">
              {t('removeCoupon')}
            </button>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{t('subtotal')}</span>
          <span>{formatPrice(subtotal, currency)}</span>
        </div>
        {appliedCoupon && (
          <div className="flex justify-between text-sm text-green-700">
            <span>{t('discount')}</span>
            <span>-{formatPrice(appliedCoupon.discountAmount, currency)}</span>
          </div>
        )}
        <div className="border-t pt-3 flex justify-between font-bold">
          <span>{t('total')}</span>
          <span>{formatPrice(total, currency)}</span>
        </div>
        {(deliveryLoading || deliveryRangeText) && (
          <p className="text-xs text-gray-500 pt-1">
            {deliveryLoading ? t('deliveryEstimateCalculating') : t('deliveryEstimate', { range: deliveryRangeText! })}
          </p>
        )}
        {!deliveryLoading && parcelCount > 1 && (
          <p className="text-xs text-gray-500">{t('multipleParcelsNote')}</p>
        )}
      </div>
    </div>
  )

  const formBlock = (
    <>
      {step === 'info' ? (
        <form onSubmit={handleSubmit(onInfoSubmit)} className="space-y-4">
          <h2 className="font-semibold text-lg mb-4">{t('contact')}</h2>
          {field(t('email'), 'email')}
          <div className="grid grid-cols-2 gap-4">
            {field(t('firstName'), 'firstName')}
            {field(t('lastName'), 'lastName')}
          </div>
          {field(t('address'), 'address')}
          <div className="grid grid-cols-2 gap-4">
            {field(t('city'), 'city')}
            {field(t('state'), 'state')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field(t('zip'), 'zip')}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('country')}</label>
              <select
                {...register('country')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                {shipCountries.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              {errors.country && <p className="text-xs text-red-500 mt-1">{errors.country.message as string}</p>}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-primary text-primary-text py-4 rounded-btn font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 mt-4">
            {loading ? t('wait') : t('continue')}
          </button>
        </form>
      ) : (
        <div>
          <h2 className="font-semibold text-lg mb-4">{t('payment')}</h2>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm clientSecret={clientSecret} formData={savedForm!} onBack={() => setStep('info')} />
          </Elements>
        </div>
      )}
    </>
  )

  if (isSingleColumn) {
    return (
      <div data-theme-section="checkout" data-variant="single-column" className="theme-checkout max-w-lg mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

        <div className="flex items-center justify-center gap-3 mb-10">
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 'info' ? 'text-gray-900' : 'text-gray-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'info' ? 'bg-primary text-primary-text' : 'bg-gray-200 text-gray-500'}`}>1</span>
            {t('contact')}
          </div>
          <div className="w-12 h-px bg-gray-300" />
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 'payment' ? 'text-gray-900' : 'text-gray-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'payment' ? 'bg-primary text-primary-text' : 'bg-gray-200 text-gray-500'}`}>2</span>
            {t('payment')}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSummaryOpen(!summaryOpen)}
          className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 mb-6 text-sm hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">{items.length} {items.length === 1 ? 'item' : 'items'} · {formatPrice(total, currency)}</span>
          <ChevronDown size={16} className={`transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
        </button>

        {summaryOpen && (
          <div className="border border-gray-200 rounded-xl p-4 mb-6">
            {summaryBlock}
          </div>
        )}

        {formBlock}
      </div>
    )
  }

  return (
    <div data-theme-section="checkout" data-variant="two-column" className="theme-checkout max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>{formBlock}</div>
        <div>{summaryBlock}</div>
      </div>
    </div>
  )
}
