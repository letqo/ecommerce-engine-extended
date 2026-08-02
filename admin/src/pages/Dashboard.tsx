import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, ShoppingCart, Users, Package, DollarSign } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Overview {
  revenue: { total: number; thisMonth: number; lastMonth: number; growth: number | null }
  orders: { total: number; thisMonth: number; pending: number }
  customers: { total: number; thisMonth: number }
  products: { total: number; active: number }
}

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'warning', CONFIRMED: 'default', PROCESSING: 'default',
  SHIPPED: 'success', DELIVERED: 'success', CANCELLED: 'destructive', REFUNDED: 'destructive',
}

function StatCard({ title, value, sub, icon: Icon, growth }: {
  title: string; value: string; sub: string; icon: any; growth?: number | null
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          <p className="text-xs text-muted-foreground">{sub}</p>
          {growth !== null && growth !== undefined && (
            <span className={`text-xs font-medium flex items-center gap-0.5 ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(growth)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [chart, setChart] = useState<{ date: string; revenue: number }[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/analytics/overview'),
      api.get('/api/admin/analytics/revenue-chart?days=30'),
      api.get('/api/admin/orders?limit=5'),
    ]).then(([ov, ch, or]) => {
      setOverview(ov.data.data)
      setChart(ch.data.data)
      setOrders(or.data.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-64" />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome back. Here's what's happening.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue" icon={DollarSign}
          value={formatCurrency(overview?.revenue.total || 0)}
          sub={`${formatCurrency(overview?.revenue.thisMonth || 0)} this month`}
          growth={overview?.revenue.growth}
        />
        <StatCard
          title="Orders" icon={ShoppingCart}
          value={String(overview?.orders.total || 0)}
          sub={`${overview?.orders.pending || 0} pending`}
        />
        <StatCard
          title="Customers" icon={Users}
          value={String(overview?.customers.total || 0)}
          sub={`${overview?.customers.thisMonth || 0} this month`}
        />
        <StatCard
          title="Products" icon={Package}
          value={String(overview?.products.active || 0)}
          sub={`${overview?.products.total || 0} total`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#000" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6">No orders yet.</p>
            ) : (
              <div className="divide-y">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium">#{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={statusColors[o.status] || 'default'}>{o.status}</Badge>
                      <p className="text-sm font-medium mt-1">{formatCurrency(o.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
