import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Truck, ClipboardCopy, Check, RefreshCw, PackageCheck, ArrowRight } from 'lucide-react'

const PARCEL_STATUS_COLORS: Record<string, any> = {
  AWAITING_MANUAL: 'warning', ERROR: 'destructive',
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'AWAITING_MANUAL', label: 'Awaiting manual' },
  { value: 'ERROR', label: 'Failed' },
] as const

function parcelLabel(so: any) {
  if (so.supplierKey === 'CJ') return 'CJ Dropshipping'
  if (so.supplierKey === 'ALIEXPRESS') return 'AliExpress'
  return so.supplierName || 'Manual fulfillment'
}

export default function FulfillmentQueue() {
  const navigate = useNavigate()
  const [parcels, setParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [carrier, setCarrier] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resultById, setResultById] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await api.get('/api/admin/fulfillment-queue', { params: statusFilter ? { status: statusFilter } : {} })
    setParcels(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter])

  const openFulfillForm = (parcelId: string) => {
    setFulfillingId(fulfillingId === parcelId ? null : parcelId)
    setTrackingNumber('')
    setTrackingUrl('')
    setCarrier('')
  }

  const fulfillManually = async (parcelId: string) => {
    if (!trackingNumber.trim()) return
    setBusyId(parcelId)
    await api.patch(`/api/admin/fulfillment-queue/${parcelId}/fulfill`, { trackingNumber, trackingUrl, carrier })
    setFulfillingId(null)
    setBusyId(null)
    await load()
  }

  const retryParcel = async (so: any, force = false) => {
    setBusyId(so.id)
    setResultById((prev) => ({ ...prev, [so.id]: undefined as any }))
    try {
      const res = await api.post(`/api/admin/fulfillment-queue/${so.id}/retry`, { force })
      setResultById((prev) => ({ ...prev, [so.id]: { ok: true, message: `Sent to ${parcelLabel(so)} — order ID: ${res.data.data.externalOrderId}` } }))
      await load()
    } catch (e: any) {
      if (e.response?.data?.code === 'SYNC_WARNING') {
        const warnings: string[] = e.response.data.warnings
        const msg = 'Supplier sync warnings:\n\n' + warnings.map((w: string) => '- ' + w).join('\n') + '\n\nProceed anyway?'
        if (confirm(msg)) {
          setBusyId(null)
          return retryParcel(so, true)
        }
        setResultById((prev) => ({ ...prev, [so.id]: { ok: false, message: 'Retry paused — review the warnings above' } }))
      } else {
        setResultById((prev) => ({ ...prev, [so.id]: { ok: false, message: e.response?.data?.error?.message ?? `Failed to submit to ${parcelLabel(so)}` } }))
      }
    } finally {
      setBusyId(null)
    }
  }

  const copyParcelDetails = async (so: any) => {
    const addr = so.order.shippingAddress as any
    const email = so.order.customer?.email || so.order.guestEmail || ''
    const lines = [
      `Order #${so.order.orderNumber} — ${parcelLabel(so)}`,
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
      ...so.items.map((item: any) => `${item.quantity}x ${item.title}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopiedId(so.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fulfillment Queue</h1>
          <p className="text-sm text-muted-foreground">
            {parcels.length} parcel{parcels.length !== 1 ? 's' : ''} need{parcels.length === 1 ? 's' : ''} attention, oldest first
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === f.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : parcels.length === 0 ? (
        <div className="border rounded-xl bg-white p-12 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PackageCheck className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg mb-1">All clear</h3>
          <p className="text-muted-foreground text-sm">Nothing needs fulfillment attention right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {parcels.map((so) => {
            const canRetry = (so.supplierKey === 'CJ' || so.supplierKey === 'ALIEXPRESS') && so.status === 'ERROR'
            const result = resultById[so.id]
            const attemptsNote = so.status === 'ERROR' && so.attempts > 0
              ? so.nextRetryAt
                ? `Attempt ${so.attempts} failed — next automatic retry ${formatDate(so.nextRetryAt)}`
                : `Gave up after ${so.attempts} automatic attempts — needs manual attention`
              : null

            return (
              <Card key={so.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Order #{so.order.orderNumber}
                      <span className="text-muted-foreground font-normal">— {parcelLabel(so)}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {so.order.customer?.email || so.order.guestEmail} · placed {formatDate(so.order.createdAt)}
                    </p>
                  </div>
                  <Badge variant={PARCEL_STATUS_COLORS[so.status]}>{so.status.replace('_', ' ')}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {so.items.map((item: any) => `${item.quantity}× ${item.title}`).join(', ')}
                  </p>

                  {so.status === 'ERROR' && so.lastError && (
                    <div className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-800">
                      {so.lastError}
                      {attemptsNote && <p className="text-xs mt-1 text-red-700">{attemptsNote}</p>}
                    </div>
                  )}

                  {result && (
                    <div className={`rounded-lg px-4 py-3 text-sm ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                      {result.message}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {canRetry && (
                      <Button size="sm" variant="outline" onClick={() => retryParcel(so)} disabled={busyId === so.id} className="gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> {busyId === so.id ? 'Sending…' : `Retry ${parcelLabel(so)}`}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => copyParcelDetails(so)} className="gap-1.5">
                      {copiedId === so.id ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                      {copiedId === so.id ? 'Copied' : 'Copy details'}
                    </Button>
                    <Button size="sm" onClick={() => openFulfillForm(so.id)}>
                      <Truck className="w-3.5 h-3.5 mr-1" /> Enter tracking
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/orders/${so.order.id}`)} className="gap-1 ml-auto">
                      View order <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

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
                          <Button size="sm" onClick={() => fulfillManually(so.id)} disabled={busyId === so.id || !trackingNumber.trim()}>Save & mark shipped</Button>
                          <Button size="sm" variant="outline" onClick={() => setFulfillingId(null)}>Cancel</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
