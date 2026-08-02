import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_COLORS: Record<string, any> = {
  NEEDS_REVIEW: 'warning', APPROVED: 'success', DENIED: 'destructive',
}
const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged', missing_parts: 'Missing parts', wrong_item: 'Wrong item', never_arrived: 'Never arrived',
}
const TABS = ['ALL', 'NEEDS_REVIEW', 'APPROVED', 'DENIED']

export default function ClaimsList() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('ALL')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status !== 'ALL') params.set('status', status)
    const res = await api.get(`/api/admin/claims?${params}`)
    setClaims(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [status])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Damage claims</h1>
        <p className="text-sm text-muted-foreground">Customer-reported problems — review the photos and resolve manually</p>
      </div>

      <div className="flex border rounded-lg overflow-hidden w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setStatus(t)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${status === t ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order total</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reported</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : claims.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No claims here.</td></tr>
            ) : claims.map((c) => {
              const email = c.order.customer?.email || c.order.guestEmail || '—'
              return (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/claims/${c.id}`)}>
                  <td className="px-4 py-3">
                    <p className="font-medium">#{c.order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </td>
                  <td className="px-4 py-3">{REASON_LABELS[c.reason] ?? c.reason}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_COLORS[c.status]}>{c.status.replace('_', ' ')}</Badge></td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(c.order.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
