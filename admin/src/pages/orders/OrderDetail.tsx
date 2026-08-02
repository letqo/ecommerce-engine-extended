import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Truck, X, PackageCheck, ClipboardCopy, Check, RefreshCw } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  PENDING: 'warning', CONFIRMED: 'default', PROCESSING: 'default',
  SHIPPED: 'success', DELIVERED: 'success', CANCELLED: 'destructive', REFUNDED: 'destructive',
}

const PARCEL_STATUS_COLORS: Record<string, any> = {
  AWAITING_MANUAL: 'warning', SUBMITTED: 'default', SHIPPED: 'success', ERROR: 'destructive', CANCELLED: 'secondary',
}

function parcelLabel(so: any) {
  if (so.supplierKey === 'CJ') return 'CJ Dropshipping'
  if (so.supplierKey === 'ALIEXPRESS') return 'AliExpress'
  return so.supplierName || 'Manual fulfillment'
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  // Per-parcel UI state, keyed by SupplierOrder id
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [carrier, setCarrier] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [resultById, setResultById] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = async () => {
    const res = await api.get(`/api/admin/orders/${id}`)
    setOrder(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return
    setActing(true)
    await api.patch(`/api/admin/orders/${id}/cancel`)
    await load()
    setActing(false)
  }

  const openFulfillForm = (parcelId: string) => {
    setFulfillingId(fulfillingId === parcelId ? null : parcelId)
    setTrackingNumber('')
    setTrackingUrl('')
    setCarrier('')
  }

  const fulfillManually = async (parcelId: string) => {
    if (!trackingNumber.trim()) return
    setActing(true)
    await api.patch(`/api/admin/orders/supplier-orders/${parcelId}/fulfill`, { trackingNumber, trackingUrl, carrier })
    await load()
    setFulfillingId(null)
    setActing(false)
  }

  const submitParcel = async (so: any, force = false) => {
    setSubmittingId(so.id)
    setResultById((prev) => ({ ...prev, [so.id]: undefined as any }))
    const endpoint = so.supplierKey === 'CJ' ? 'fulfill-cj' : 'fulfill-aliexpress'
    try {
      const res = await api.post(`/api/admin/orders/${order.id}/${endpoint}`, { force })
      await load()
      const extId = res.data.data.cjOrderId ?? res.data.data.aliexpressOrderId
      setResultById((prev) => ({ ...prev, [so.id]: { ok: true, message: `Sent to ${parcelLabel(so)} — order ID: ${extId}` } }))
    } catch (e: any) {
      if (e.response?.data?.code === 'SYNC_WARNING') {
        const warnings: string[] = e.response.data.warnings
        const msg = 'Supplier sync warnings:\n\n' + warnings.map((w: string) => '- ' + w).join('\n') + '\n\nProceed anyway?'
        if (confirm(msg)) {
          setSubmittingId(null)
          return submitParcel(so, true)
        }
        setResultById((prev) => ({ ...prev, [so.id]: { ok: false, message: 'Submission paused — review the warnings above' } }))
      } else {
        setResultById((prev) => ({ ...prev, [so.id]: { ok: false, message: e.response?.data?.error?.message ?? `Failed to submit to ${parcelLabel(so)}` } }))
      }
    } finally {
      setSubmittingId(null)
    }
  }

  // Formats one parcel's shipping + item details so they can be pasted straight into a
  // manual supplier's order form (or a CJ/AliExpress dashboard) without retyping.
  const copyParcelDetails = async (so: any) => {
    const addr = order.shippingAddress as any
    const email = order.customer?.email || order.guestEmail || ''
    const lines = [
      `Order #${order.orderNumber} — ${parcelLabel(so)}`,
      '',
      'Ship to:',
      `${addr.firstName} ${addr.lastName}`,
      addr.address1,
      ...(addr.address2 ? [addr.address2] : []),
      `${addr.city}, ${addr.province || ''} ${addr.postalCode}`.replace(/\s+/g, ' ').trim(),
      addr.country,
      ...(addr.phone ? [`Phone: ${addr.phone}`] : []),
      ...(email ? [`Email: ${email}`] : []),
      '',
      'Items:',
      ...so.items.map((item: any) => `${item.quantity}x ${item.title}${item.variantTitle && item.variantTitle !== 'Default' ? ` (${item.variantTitle})` : ''}${item.sku ? ` — SKU: ${item.sku}` : ''}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopiedId(so.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
    </div>
  )

  if (!order) return <div className="p-6 text-muted-foreground">Order not found.</div>

  const addr = order.shippingAddress as any

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/orders')}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">Order #{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_COLORS[order.status]}>{order.status}</Badge>
          {order.supplierOrders?.length > 1 && <Badge variant="secondary">{order.supplierOrders.length} parcels</Badge>}
          {!['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status) && (
            <Button size="sm" variant="outline" onClick={cancel} disabled={acting}>
              <X className="w-3.5 h-3.5" /> Cancel order
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Parcels + timeline */}
        <div className="col-span-2 space-y-6">
          {(order.supplierOrders ?? []).length === 0 && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">Splitting this order into parcels — refresh in a moment.</CardContent></Card>
          )}

          {(order.supplierOrders ?? []).map((so: any) => {
            const canSubmitToApi = (so.supplierKey === 'CJ' || so.supplierKey === 'ALIEXPRESS') && so.status !== 'SHIPPED' && so.status !== 'CANCELLED'
            const canFulfillManually = so.status !== 'SHIPPED' && so.status !== 'CANCELLED'
            const result = resultById[so.id]

            return (
              <Card key={so.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Parcel — {parcelLabel(so)}</CardTitle>
                    {so.externalOrderId && <p className="text-xs text-muted-foreground mt-1">Order ID: <span className="font-mono">{so.externalOrderId}</span></p>}
                  </div>
                  <Badge variant={PARCEL_STATUS_COLORS[so.status]}>{so.status.replace('_', ' ')}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {so.items.map((item: any) => (
                        <tr key={item.id}>
                          <td className="py-2">
                            <div className="flex items-center gap-3">
                              {item.imageUrl
                                ? <img src={item.imageUrl} className="w-9 h-9 rounded-lg object-cover border" />
                                : <div className="w-9 h-9 rounded-lg bg-gray-100 border" />}
                              <div>
                                <p className="font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground">{item.variantTitle}{item.sku ? ` · SKU: ${item.sku}` : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 text-center whitespace-nowrap">{formatCurrency(item.price)} × {item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {so.status === 'ERROR' && so.lastError && (
                    <div className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-800">{so.lastError}</div>
                  )}

                  {so.status === 'SHIPPED' && (
                    <div className="rounded-lg px-4 py-3 text-sm bg-green-50 border border-green-200 text-green-800 space-y-1">
                      <p>Tracking: <span className="font-mono font-medium">{so.trackingNumber}</span>{so.trackingCarrier ? ` (${so.trackingCarrier})` : ''}</p>
                      {so.trackingUrl && <a href={so.trackingUrl} target="_blank" rel="noreferrer" className="underline text-xs">Track package →</a>}
                    </div>
                  )}

                  {result && (
                    <div className={`rounded-lg px-4 py-3 text-sm ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                      {result.message}
                    </div>
                  )}

                  {(canSubmitToApi || canFulfillManually) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canSubmitToApi && (
                        <Button size="sm" variant="outline" onClick={() => submitParcel(so)} disabled={submittingId === so.id} className="gap-1.5">
                          {so.status === 'ERROR' ? <RefreshCw className="w-3.5 h-3.5" /> : <PackageCheck className="w-3.5 h-3.5" />}
                          {submittingId === so.id ? 'Sending…' : so.status === 'ERROR' ? `Retry ${parcelLabel(so)}` : `Submit to ${parcelLabel(so)}`}
                        </Button>
                      )}
                      {canFulfillManually && (
                        <Button size="sm" variant="outline" onClick={() => copyParcelDetails(so)} className="gap-1.5">
                          {copiedId === so.id ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                          {copiedId === so.id ? 'Copied' : 'Copy details'}
                        </Button>
                      )}
                      {canFulfillManually && (
                        <Button size="sm" onClick={() => openFulfillForm(so.id)}>
                          <Truck className="w-3.5 h-3.5 mr-1" /> Enter tracking
                        </Button>
                      )}
                    </div>
                  )}

                  {fulfillingId === so.id && (
                    <Card className="border-blue-200 bg-blue-50">
                      <CardContent className="pt-4 space-y-3">
                        <p className="text-sm font-medium">Add tracking information</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Tracking number *</Label>
                            <Input placeholder="e.g. 1Z999AA10123456784" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Carrier (optional)</Label>
                            <Input placeholder="e.g. USPS" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label>Tracking URL (optional)</Label>
                            <Input placeholder="https://track.carrier.com/..." value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => fulfillManually(so.id)} disabled={acting || !trackingNumber.trim()}>Save & mark shipped</Button>
                          <Button size="sm" variant="outline" onClick={() => setFulfillingId(null)}>Cancel</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            )
          })}

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.timeline.map((t: any) => (
                  <div key={t.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm">{t.message}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.createdAt)} · {t.createdBy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.customer ? (
                <>
                  <p className="font-medium">{order.customer.firstName} {order.customer.lastName}</p>
                  <p className="text-muted-foreground">{order.customer.email}</p>
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate(`/customers/${order.customerId}`)}>View customer →</Button>
                </>
              ) : (
                <p className="text-muted-foreground">{order.guestEmail || 'Guest'}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Shipping address</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-0.5">
              <p className="font-medium">{addr.firstName} {addr.lastName}</p>
              <p className="text-muted-foreground">{addr.address1}</p>
              {addr.address2 && <p className="text-muted-foreground">{addr.address2}</p>}
              <p className="text-muted-foreground">{addr.city}, {addr.province} {addr.postalCode}</p>
              <p className="text-muted-foreground">{addr.country}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>{order.paymentStatus}</Badge>
              </div>
              {order.paymentMethod && <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{order.paymentMethod}</span></div>}
              <div className="flex justify-between pt-2 border-t mt-2"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              {order.discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−{formatCurrency(order.discountAmount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatCurrency(order.shippingAmount)}</span></div>
              <div className="flex justify-between font-semibold pt-1"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
