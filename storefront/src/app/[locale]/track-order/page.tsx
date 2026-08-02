'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { Package, Truck, CheckCircle2, Clock, Search, ExternalLink, TriangleAlert } from 'lucide-react'

type OrderItem = { title: string; variantTitle: string; quantity: number; price: number; imageUrl: string | null }

interface SupplierParcel {
  id: string
  supplierKey: 'CJ' | 'ALIEXPRESS' | 'MANUAL'
  supplierName: string | null
  status: 'AWAITING_MANUAL' | 'SUBMITTED' | 'SHIPPED' | 'ERROR' | 'CANCELLED'
  trackingNumber: string | null
  trackingUrl: string | null
  trackingCarrier: string | null
  shippedAt: string | null
  items: OrderItem[]
}

interface OrderData {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  total: number
  currency: string
  shippingAddress: any
  items: OrderItem[]
  // Empty for a brief window right after checkout, before the async supplier split runs.
  supplierOrders: SupplierParcel[]
  createdAt: string
}

const STATUS_STEPS = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.indexOf(status as any)
  return idx >= 0 ? idx : 0
}

export default function TrackOrderPage() {
  const t = useTranslations('trackOrder')
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber.trim() || !email.trim()) return
    setLoading(true)
    setError('')
    setOrder(null)
    try {
      const res = await api.get<{ success: boolean; data: OrderData }>(
        `/store/orders/${orderNumber.trim()}/status?email=${encodeURIComponent(email.trim())}`
      )
      setOrder(res.data)
    } catch (err: any) {
      setError(err.message || t('notFound'))
    } finally {
      setLoading(false)
    }
  }

  const currentStep = order ? getStepIndex(order.status) : 0

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
      <p className="text-gray-500 mb-8">{t('subtitle')}</p>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-10">
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('orderNumberPlaceholder')}
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          className="flex-1 h-11 rounded-lg border border-gray-300 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 h-11 rounded-lg border border-gray-300 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-11 px-6 bg-primary text-primary-text rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          <Search size={16} />
          {loading ? t('searching') : t('search')}
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {order && (
        <div className="space-y-6">
          {/* Status header */}
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-gray-500">{t('orderLabel')} #{order.orderNumber}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(order.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <span className="text-lg font-bold">{formatPrice(order.total, order.currency)}</span>
            </div>

            {/* Progress steps */}
            {order.status !== 'CANCELLED' && (
              <div className="flex items-center justify-between mb-2">
                {STATUS_STEPS.map((step, i) => {
                  const done = i <= currentStep
                  const icons = [CheckCircle2, Package, Truck, CheckCircle2]
                  const Icon = icons[i]
                  return (
                    <div key={step} className="flex flex-col items-center flex-1">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${done ? 'bg-primary text-primary-text' : 'bg-gray-200 text-gray-400'}`}>
                        <Icon size={18} />
                      </div>
                      <span className={`text-xs mt-1.5 ${done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                        {t(`status_${step}`)}
                      </span>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`hidden sm:block absolute h-0.5 w-full ${done ? 'bg-primary' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {order.status === 'CANCELLED' && (
              <p className="text-red-600 font-medium text-sm">{t('cancelled')}</p>
            )}
          </div>

          {order.supplierOrders.length > 1 && order.status !== 'CANCELLED' && (
            <p className="text-sm text-gray-500 -mt-2">{t('multipleParcelsNote')}</p>
          )}

          {/* One block per parcel — an order can ship separately from more than one supplier */}
          {order.supplierOrders.length > 0 ? (
            <div className="space-y-4">
              {order.supplierOrders.map((parcel) => (
                <div key={parcel.id}>
                  {order.supplierOrders.length > 1 && (
                    <h2 className="font-semibold mb-2 text-sm text-gray-700">
                      {parcel.supplierKey === 'CJ' ? 'CJ Dropshipping' : parcel.supplierKey === 'ALIEXPRESS' ? 'AliExpress' : parcel.supplierName || t('items')}
                    </h2>
                  )}

                  {parcel.status === 'SHIPPED' && parcel.trackingNumber ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-3">
                      <div className="flex items-start gap-3">
                        <Truck size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-blue-900 text-sm">{t('trackingLabel')}</p>
                          <p className="font-mono text-blue-800 text-lg mt-1">{parcel.trackingNumber}</p>
                          {parcel.trackingUrl && (
                            <a
                              href={parcel.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mt-2"
                            >
                              {t('trackPackage')} <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : order.status !== 'CANCELLED' ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-3">
                      <div className="flex items-start gap-3">
                        <Clock size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-amber-900 text-sm">{t('noTrackingYet')}</p>
                          <p className="text-amber-700 text-sm mt-1">{t('noTrackingMessage')}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {parcel.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 border border-gray-200 rounded-xl">
                        <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                          {item.imageUrl ? (
                            <Image src={item.imageUrl} alt={item.title} width={56} height={56} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Package size={20} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.title}</p>
                          {item.variantTitle && <p className="text-xs text-gray-500">{item.variantTitle}</p>}
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium">{formatPrice(item.price, order.currency)}</p>
                          <p className="text-gray-400">×{item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {order.status !== 'CANCELLED' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Clock size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">{t('noTrackingYet')}</p>
                      <p className="text-amber-700 text-sm mt-1">{t('noTrackingMessage')}</p>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <h2 className="font-semibold mb-3">{t('items')}</h2>
                <div className="space-y-3">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 border border-gray-200 rounded-xl">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.title} width={56} height={56} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Package size={20} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        {item.variantTitle && <p className="text-xs text-gray-500">{item.variantTitle}</p>}
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{formatPrice(item.price, order.currency)}</p>
                        <p className="text-gray-400">×{item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Report a problem */}
          {(order.status === 'SHIPPED' || order.status === 'DELIVERED') && (
            <div className="border-t border-gray-200 pt-6">
              <Link
                href={`/report-issue?order=${order.orderNumber}&email=${encodeURIComponent(email)}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                <TriangleAlert size={16} />
                Item arrived damaged or missing something? Report it
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
