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
import { ArrowLeft, Truck, X, RefreshCw, PackageCheck, ClipboardCopy, Check } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  PENDING: 'warning', CONFIRMED: 'default', PROCESSING: 'default',
  SHIPPED: 'success', DELIVERED: 'success', CANCELLED: 'destructive', REFUNDED: 'destructive',
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [showFulfill, setShowFulfill] = useState(false)
  const [acting, setActing] = useState(false)
  const [cjFulfilling, setCjFulfilling] = useState(false)
  const [cjResult, setCjResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [aeFulfilling, setAeFulfilling] = useState(false)
  const [aeResult, setAeResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const res = await api.get(`/api/admin/orders/${id}`)
    setOrder(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const fulfill = async () => {
    if (!trackingNumber.trim()) return
    setActing(true)
    await api.patch(`/api/admin/orders/${id}/fulfill`, { trackingNumber, trackingUrl })
    await load()
    setShowFulfill(false)
    setActing(false)
  }

  const fulfillWithCJ = async (force = false) => {
    setCjFulfilling(true)
    setCjResult(null)
    try {
      const res = await api.post(`/api/admin/orders/${id}/fulfill-cj`, { force })
      await load()
      setCjResult({ ok: true, message: `Order sent to CJ! CJ order ID: ${res.data.data.cjOrderId}` })
    } catch (e: any) {
      if (e.response?.data?.code === 'SYNC_WARNING') {
        const warnings: string[] = e.response.data.warnings
        const msg = 'Supplier sync warnings:\n\n' + warnings.map((w: string) => '- ' + w).join('\n') + '\n\nProceed anyway?'
        if (confirm(msg)) {
          setCjFulfilling(false)
          return fulfillWithCJ(true)
        }
        setCjResult({ ok: false, message: 'Fulfillment paused — review the warnings above' })
      } else {
        setCjResult({ ok: false, message: e.response?.data?.error?.message ?? 'Failed to submit to CJ' })
      }
    } finally {
      setCjFulfilling(false)
    }
  }

  const fulfillWithAliExpress = async (force = false) => {
    setAeFulfilling(true)
    setAeResult(null)
    try {
      const res = await api.post(`/api/admin/orders/${id}/fulfill-aliexpress`, { force })
      await load()
      setAeResult({ ok: true, message: `Order sent to AliExpress! Order ID: ${res.data.data.aliexpressOrderId}` })
    } catch (e: any) {
      if (e.response?.data?.code === 'SYNC_WARNING') {
        const warnings: string[] = e.response.data.warnings
        const msg = 'Supplier sync warnings:\n\n' + warnings.map((w: string) => '- ' + w).join('\n') + '\n\nProceed anyway?'
        if (confirm(msg)) {
          setAeFulfilling(false)
          return fulfillWithAliExpress(true)
        }
        setAeResult({ ok: false, message: 'Fulfillment paused — review the warnings above' })
      } else {
        setAeResult({ ok: false, message: e.response?.data?.error?.message ?? 'Failed to submit to AliExpress' })
      }
    } finally {
      setAeFulfilling(false)
    }
  }

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return
    setActing(true)
    await api.patch(`/api/admin/orders/${id}/cancel`)
    await load()
    setActing(false)
  }

  // Formats everything a manual supplier order form needs — name, address, items with SKUs —
  // so it can be pasted straight into a supplier's own checkout/inquiry form without retyping.
  const copyFulfillmentDetails = async () => {
    const addr = order.shippingAddress as any
    const email = order.customer?.email || order.guestEmail || ''
    const lines = [
      `Order #${order.orderNumber}`,
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
      ...order.items.map((item: any) => `${item.quantity}x ${item.title}${item.variantTitle && item.variantTitle !== 'Default' ? ` (${item.variantTitle})` : ''}${item.sku ? ` — SKU: ${item.sku}` : ''}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          {!['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status) && (
            <>
              {!order.cjOrderId && order.items.some((i: any) => i.variant?.cjVariantId) && (
                <Button size="sm" variant="outline" onClick={() => fulfillWithCJ()} disabled={cjFulfilling || aeFulfilling || acting} className="gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                  {cjFulfilling ? 'Sending to CJ…' : 'Fulfill with CJ'}
                </Button>
              )}
              {!order.aliexpressOrderId && order.items.some((i: any) => i.variant?.aliexpressSkuId || i.variant?.aliexpressSkuAttr) && (
                <Button size="sm" variant="outline" onClick={() => fulfillWithAliExpress()} disabled={aeFulfilling || cjFulfilling || acting} className="gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                  {aeFulfilling ? 'Sending to AliExpress…' : 'Fulfill with AliExpress'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={copyFulfillmentDetails} className="gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy details'}
              </Button>
              <Button size="sm" onClick={() => setShowFulfill(!showFulfill)} disabled={acting}>
                <Truck className="w-3.5 h-3.5 mr-1" /> Fulfill
              </Button>
              <Button size="sm" variant="outline" onClick={cancel} disabled={acting}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Fulfill form */}
      {showFulfill && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Add tracking information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tracking number *</Label>
                <Input placeholder="e.g. 1Z999AA10123456784" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tracking URL (optional)</Label>
                <Input placeholder="https://track.carrier.com/..." value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={fulfill} disabled={acting || !trackingNumber.trim()}>Save & mark shipped</Button>
              <Button size="sm" variant="outline" onClick={() => setShowFulfill(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cjResult && (
        <div className={`rounded-lg px-4 py-3 text-sm ${cjResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {cjResult.message}
        </div>
      )}

      {aeResult && (
        <div className={`rounded-lg px-4 py-3 text-sm ${aeResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {aeResult.message}
        </div>
      )}

      {order.cjOrderId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          Submitted to CJ Dropshipping — CJ order ID: <span className="font-mono font-medium">{order.cjOrderId}</span>
        </div>
      )}

      {order.aliexpressOrderId && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800">
          Submitted to AliExpress — order ID: <span className="font-mono font-medium">{order.aliexpressOrderId}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Items */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Items</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {order.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.imageUrl
                            ? <img src={item.imageUrl} className="w-10 h-10 rounded-lg object-cover border" />
                            : <div className="w-10 h-10 rounded-lg bg-gray-100 border" />}
                          <div>
                            <p className="font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                            {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{formatCurrency(item.price)} × {item.quantity}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr><td colSpan={2} className="px-4 py-2 text-sm text-muted-foreground">Subtotal</td><td className="px-4 py-2 text-sm text-right">{formatCurrency(order.subtotal)}</td></tr>
                  {order.discountAmount > 0 && <tr><td colSpan={2} className="px-4 py-2 text-sm text-green-600">Discount</td><td className="px-4 py-2 text-sm text-right text-green-600">−{formatCurrency(order.discountAmount)}</td></tr>}
                  <tr><td colSpan={2} className="px-4 py-2 text-sm text-muted-foreground">Shipping</td><td className="px-4 py-2 text-sm text-right">{formatCurrency(order.shippingAmount)}</td></tr>
                  <tr><td colSpan={2} className="px-4 py-2 font-semibold">Total</td><td className="px-4 py-2 font-semibold text-right">{formatCurrency(order.total)}</td></tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Timeline */}
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

          {order.trackingNumber && (
            <Card>
              <CardHeader><CardTitle>Tracking</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-mono">{order.trackingNumber}</p>
                {order.trackingUrl && (
                  <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Track package →</a>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>{order.paymentStatus}</Badge>
              </div>
              {order.paymentMethod && <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{order.paymentMethod}</span></div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
