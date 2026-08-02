import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  PENDING: 'warning', CONFIRMED: 'default', PROCESSING: 'default',
  SHIPPED: 'success', DELIVERED: 'success', CANCELLED: 'destructive', REFUNDED: 'destructive',
}
const PAYMENT_COLORS: Record<string, any> = {
  PAID: 'success', UNPAID: 'warning', FAILED: 'destructive',
  PARTIALLY_REFUNDED: 'warning', FULLY_REFUNDED: 'secondary',
}
const TABS = ['ALL', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']

export default function OrderList() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '20' })
    if (search) params.set('search', search)
    if (status !== 'ALL') params.set('status', status)
    const res = await api.get(`/api/admin/orders?${params}`)
    setOrders(res.data.data)
    setTotal(res.data.meta.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [status])
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [search])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">{total} total</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by order # or email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex border rounded-lg overflow-hidden">
          {TABS.map((t) => (
            <button key={t} onClick={() => setStatus(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${status === t ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payment</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Items</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No orders yet.</td></tr>
            ) : orders.map((o) => {
              const email = o.customer?.email || o.guestEmail || '—'
              const name = o.customer ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() : 'Guest'
              return (
                <tr key={o.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className="px-4 py-3 font-medium">#{o.orderNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{name || 'Guest'}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant={STATUS_COLORS[o.status]}>{o.status}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={PAYMENT_COLORS[o.paymentStatus]}>{o.paymentStatus}</Badge></td>
                  <td className="px-4 py-3">{o.items?.length || 0}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(o.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
