import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  PENDING: 'warning', CONFIRMED: 'default', SHIPPED: 'success',
  DELIVERED: 'success', CANCELLED: 'destructive',
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/admin/customers/${id}`).then((r) => {
      setCustomer(r.data.data)
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
    </div>
  )

  if (!customer) return <div className="p-6 text-muted-foreground">Customer not found.</div>

  const totalSpent = customer.orders.reduce((s: number, o: any) => s + o.total, 0)

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/customers')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{customer.firstName || ''} {customer.lastName || ''}</h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <Card><CardContent className="pt-4"><p className="text-muted-foreground">Orders</p><p className="text-2xl font-bold mt-1">{customer.orders.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-muted-foreground">Total spent</p><p className="text-2xl font-bold mt-1">{formatCurrency(totalSpent)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-muted-foreground">Joined</p><p className="text-2xl font-bold mt-1">{formatDate(customer.createdAt)}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {customer.orders.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {customer.orders.map((o: any) => (
                      <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                        <td className="px-4 py-3 font-medium">#{o.orderNumber}</td>
                        <td className="px-4 py-3"><Badge variant={STATUS_COLORS[o.status] || 'default'}>{o.status}</Badge></td>
                        <td className="px-4 py-3">{formatCurrency(o.total)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{customer.phone}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Marketing</span><span>{customer.acceptsMarketing ? 'Subscribed' : 'Not subscribed'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Verified</span><span>{customer.isVerified ? 'Yes' : 'No'}</span></div>
            </CardContent>
          </Card>

          {customer.addresses?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Addresses</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-3">
                {customer.addresses.map((a: any) => (
                  <div key={a.id} className="space-y-0.5">
                    <p className="font-medium">{a.firstName} {a.lastName}</p>
                    <p className="text-muted-foreground">{a.address1}</p>
                    <p className="text-muted-foreground">{a.city}, {a.postalCode}</p>
                    <p className="text-muted-foreground">{a.country}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
