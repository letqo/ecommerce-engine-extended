import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, CheckCircle2, XCircle, Copy, Truck } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  NEEDS_REVIEW: 'warning', APPROVED: 'success', DENIED: 'destructive',
}
const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged', missing_parts: 'Missing parts', wrong_item: 'Wrong item', never_arrived: 'Never arrived',
}
const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  filed: 'Filed with supplier', reimbursed: 'Reimbursed by supplier', not_pursuing: 'Not pursuing',
}

function buildSupplierDraft(claim: any, supplierOrderId: string): string {
  const lines = [
    `Order reference: ${supplierOrderId}`,
    `Issue: ${REASON_LABELS[claim.reason] ?? claim.reason}`,
    claim.description,
    '',
    'Customer reported this with photos on receipt of the item. Requesting a refund only — no return needed.',
    '',
    'Photos:',
    ...claim.photos.map((url: string) => url),
  ]
  return lines.join('\n')
}

export default function ClaimDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [denyReason, setDenyReason] = useState('')
  const [showDeny, setShowDeny] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [settingSupplierStatus, setSettingSupplierStatus] = useState(false)

  const load = async () => {
    const res = await api.get(`/api/admin/claims/${id}`)
    setClaim(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const resolved = claim && ['APPROVED', 'DENIED'].includes(claim.status)

  const approve = async (resolution: 'refund' | 'replacement') => {
    setActing(true)
    setError('')
    try {
      await api.post(`/api/admin/claims/${id}/approve`, { resolution })
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Failed to approve')
    } finally {
      setActing(false)
    }
  }

  const deny = async () => {
    if (!denyReason.trim()) return
    setActing(true)
    setError('')
    try {
      await api.post(`/api/admin/claims/${id}/deny`, { reason: denyReason })
      await load()
      setShowDeny(false)
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Failed to deny')
    } finally {
      setActing(false)
    }
  }

  const setSupplierStatus = async (status: string | null) => {
    setSettingSupplierStatus(true)
    try {
      await api.post(`/api/admin/claims/${id}/supplier-status`, { status })
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Failed to update')
    } finally {
      setSettingSupplierStatus(false)
    }
  }

  if (loading || !claim) return <div className="p-6"><Skeleton className="h-40 w-full" /></div>

  const supplierOrderId = claim.order.cjOrderId || claim.order.aliexpressOrderId
  const supplierName = claim.order.cjOrderId ? 'CJ Dropshipping' : claim.order.aliexpressOrderId ? 'AliExpress' : null
  const wholesaleCosts = claim.order.items
    .map((item: any) => item.variant?.costPerItem)
    .filter((c: any) => typeof c === 'number')
  const estimatedWholesaleCost = wholesaleCosts.length > 0 ? wholesaleCosts.reduce((a: number, b: number) => a + b, 0) : null
  const supplierDraft = supplierOrderId ? buildSupplierDraft(claim, supplierOrderId) : null

  const copyDraft = () => {
    if (!supplierDraft) return
    navigator.clipboard.writeText(supplierDraft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/claims')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Order #{claim.order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">{claim.order.customer?.email || claim.order.guestEmail}</p>
        </div>
        <Badge variant={STATUS_COLORS[claim.status]} className="ml-auto">{claim.status.replace('_', ' ')}</Badge>
      </div>

      {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-sm">Customer report</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-6 text-sm">
            <div><span className="text-muted-foreground">Reason: </span>{REASON_LABELS[claim.reason] ?? claim.reason}</div>
            <div><span className="text-muted-foreground">Reported: </span>{formatDate(claim.createdAt)}</div>
            <div><span className="text-muted-foreground">Order total: </span>{formatCurrency(claim.order.total)}</div>
          </div>
          <p className="text-sm text-gray-700">{claim.description}</p>
          {claim.photos?.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {claim.photos.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} className="w-full aspect-square object-cover rounded-lg border" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Order items</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {claim.order.items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              {item.imageUrl && <img src={item.imageUrl} className="w-10 h-10 rounded object-cover border" />}
              <div className="flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.variantTitle !== 'Default' ? item.variantTitle : ''} × {item.quantity}</p>
              </div>
              <p className="text-sm">{formatCurrency(item.price * item.quantity)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {!resolved && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Resolve</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!showDeny ? (
              <div className="flex gap-3">
                <Button onClick={() => approve('refund')} disabled={acting} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Approve refund ({formatCurrency(claim.order.total)})
                </Button>
                <Button onClick={() => approve('replacement')} disabled={acting} variant="outline" className="gap-2">
                  Approve replacement
                </Button>
                <Button onClick={() => setShowDeny(true)} disabled={acting} variant="outline" className="ml-auto gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <XCircle className="w-4 h-4" /> Deny
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea placeholder="Reason to share with the customer…" value={denyReason} onChange={(e) => setDenyReason(e.target.value)} rows={3} />
                <div className="flex gap-2">
                  <Button onClick={deny} disabled={acting || !denyReason.trim()} variant="destructive">Confirm deny</Button>
                  <Button onClick={() => setShowDeny(false)} variant="ghost">Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {resolved && (
        <p className="text-sm text-muted-foreground">
          Resolved {claim.resolvedAt ? formatDate(claim.resolvedAt) : ''} by {claim.resolvedBy}
          {claim.resolution ? ` — ${claim.resolution}` : ''}.
        </p>
      )}

      {resolved && claim.status !== 'DENIED' && supplierOrderId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4" /> Supplier reimbursement
              {claim.supplierClaimStatus && (
                <Badge variant={claim.supplierClaimStatus === 'reimbursed' ? 'success' : 'outline'} className="ml-auto">
                  {SUPPLIER_STATUS_LABELS[claim.supplierClaimStatus] ?? claim.supplierClaimStatus}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You already refunded the customer — this is separate: recovering what you paid {supplierName} for this
              item{estimatedWholesaleCost != null ? ` (~${formatCurrency(estimatedWholesaleCost)} wholesale)` : ''}.
              There's no API for this, so open a dispute yourself in your {supplierName} dashboard on order{' '}
              <span className="font-mono">{supplierOrderId}</span>, pick "refund only" (no return), and paste in the
              message below.
            </p>
            <div className="relative">
              <pre className="text-xs bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap font-mono">{supplierDraft}</pre>
              <Button size="sm" variant="outline" onClick={copyDraft} className="absolute top-2 right-2 gap-1.5">
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={claim.supplierClaimStatus === 'filed' ? 'default' : 'outline'} disabled={settingSupplierStatus} onClick={() => setSupplierStatus('filed')}>
                Mark as filed
              </Button>
              <Button size="sm" variant={claim.supplierClaimStatus === 'reimbursed' ? 'default' : 'outline'} disabled={settingSupplierStatus} onClick={() => setSupplierStatus('reimbursed')}>
                Mark as reimbursed
              </Button>
              <Button size="sm" variant={claim.supplierClaimStatus === 'not_pursuing' ? 'default' : 'outline'} disabled={settingSupplierStatus} onClick={() => setSupplierStatus('not_pursuing')}>
                Not pursuing
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
