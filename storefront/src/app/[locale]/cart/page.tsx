'use client'
import { useState, useEffect } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import Image from 'next/image'
import { useTranslations, useLocale } from 'next-intl'
import { useCartStore } from '@/stores/cartStore'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'
import { Trash2, ShoppingBag, AlertTriangle, Truck } from 'lucide-react'
import { api } from '@/lib/api'

interface StockIssue {
  variantId: string
  title: string
  requested: number
  available: number
}

export default function CartPage() {
  const t = useTranslations('cart')
  const locale = useLocale()
  const currency = useCurrency()
  const { items, removeItem, updateQty } = useCartStore()
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([])
  const [cartLayout, setCartLayout] = useState<'sidebar' | 'bottom-bar'>('sidebar')

  useEffect(() => {
    const layout = document.body.dataset.cartLayout
    if (layout === 'bottom-bar') setCartLayout('bottom-bar')
  }, [])

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const isBottomBar = cartLayout === 'bottom-bar'

  const handleProceed = async () => {
    setChecking(true)
    setStockIssues([])
    try {
      const res = await api.post<{ success: boolean; data: { valid: boolean; issues: StockIssue[] } }>(
        '/store/cart/validate',
        { items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) }
      )
      if (res.data.valid) {
        router.push('/checkout')
      } else {
        setStockIssues(res.data.issues)
      }
    } catch {
      router.push('/checkout')
    } finally {
      setChecking(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={64} className="mx-auto text-gray-300 mb-6" />
        <h1 className="text-2xl font-bold mb-4">{t('empty')}</h1>
        <p className="text-gray-500 mb-8">{t('emptySub')}</p>
        <Link href="/products" className="inline-block bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors">
          {t('shopNow')}
        </Link>
      </div>
    )
  }

  return (
    <div data-theme-section="cart" data-variant={cartLayout} className={`theme-cart max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 ${isBottomBar ? 'pb-32' : ''}`}>
      <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>

      {stockIssues.length > 0 && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 mb-2">{t('stockIssue')}</p>
              <ul className="space-y-1">
                {stockIssues.map((issue) => (
                  <li key={issue.variantId} className="text-sm text-orange-700">
                    {issue.available === 0
                      ? t('unavailable', { title: issue.title })
                      : t('limited', { title: issue.title, requested: issue.requested, available: issue.available })}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-orange-700 mt-2">{t('updateQty')}</p>
            </div>
          </div>
        </div>
      )}

      {isBottomBar ? (
        <>
          <div className="max-w-3xl mx-auto space-y-4">
            {items.map((item) => {
              const issue = stockIssues.find((s) => s.variantId === item.variantId)
              return (
                <div key={item.variantId} className={`flex items-center gap-4 p-4 border rounded-xl ${issue ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                  <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                    <Image src={item.image || '/placeholder.jpg'} alt={item.name} width={64} height={64} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{item.name}</h3>
                    {item.variant && <p className="text-xs text-gray-500">{item.variant}</p>}
                    {item.deliveryMinDays != null && item.deliveryMinDays > 0 && (() => {
                      const now = new Date()
                      const minD = new Date(now.getTime() + item.deliveryMinDays! * 86400000)
                      const maxD = new Date(now.getTime() + (item.deliveryMaxDays ?? item.deliveryMinDays!) * 86400000)
                      const fmt = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                      return (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Truck size={12} />
                          {t('delivery')}: {fmt(minD)} – {fmt(maxD)}
                        </p>
                      )
                    })()}
                    {issue && issue.available > 0 && (
                      <p className="text-xs text-orange-600 mt-0.5">{t('onlyAvailable', { count: issue.available })}</p>
                    )}
                  </div>
                  <span className="font-bold text-sm whitespace-nowrap">{formatPrice(item.price, currency)}</span>
                  <div className="flex items-center border border-gray-300 rounded-lg">
                    <button onClick={() => updateQty(item.variantId, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-50">−</button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => updateQty(item.variantId, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-50">+</button>
                  </div>
                  <button onClick={() => removeItem(item.variantId)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 px-4 z-40">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">{t('subtotal')}</span>
                <span className="ml-2 text-lg font-bold">{formatPrice(subtotal, currency)}</span>
              </div>
              <button
                onClick={handleProceed}
                disabled={checking}
                className="bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
              >
                {checking ? t('checking') : t('proceed')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => {
              const issue = stockIssues.find((s) => s.variantId === item.variantId)
              return (
                <div key={item.variantId} className={`flex gap-4 p-4 border rounded-xl ${issue ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                  <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                    <Image src={item.image || '/placeholder.jpg'} alt={item.name} width={96} height={96} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                    {item.variant && <p className="text-sm text-gray-500 mt-0.5">{item.variant}</p>}
                    <p className="font-bold mt-2">{formatPrice(item.price, currency)}</p>
                    {item.deliveryMinDays != null && item.deliveryMinDays > 0 && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                        <Truck size={12} />
                        {t('delivery', { min: item.deliveryMinDays, max: item.deliveryMaxDays ?? item.deliveryMinDays })}
                      </p>
                    )}
                    {issue && issue.available > 0 && (
                      <p className="text-xs text-orange-600 mt-1">{t('onlyAvailable', { count: issue.available })}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <button onClick={() => removeItem(item.variantId)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                    <div className="flex items-center border border-gray-300 rounded-lg">
                      <button onClick={() => updateQty(item.variantId, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-50">−</button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => updateQty(item.variantId, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-50">+</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <div className="bg-gray-50 rounded-2xl p-6 sticky top-20">
              <h2 className="font-bold text-lg mb-4">{t('summary')}</h2>
              <div className="space-y-3 mb-6 text-sm">
                {items.map((i) => (
                  <div key={i.variantId} className="flex justify-between text-gray-600">
                    <span className="truncate mr-2">{i.name} × {i.quantity}</span>
                    <span className="font-medium">{formatPrice(i.price * i.quantity, currency)}</span>
                  </div>
                ))}
                <div className="border-t pt-3 flex justify-between font-bold text-base">
                  <span>{t('subtotal')}</span>
                  <span>{formatPrice(subtotal, currency)}</span>
                </div>
                <p className="text-gray-500 text-xs">{t('shippingNote')}</p>
              </div>
              <button
                onClick={handleProceed}
                disabled={checking}
                className="block w-full bg-primary text-primary-text text-center py-4 rounded-btn font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
              >
                {checking ? t('checking') : t('proceed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
