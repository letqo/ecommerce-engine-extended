import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  code: z.string().min(1, 'Code required'),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.coerce.number().min(0),
  minOrderAmount: z.coerce.number().optional(),
  maxUses: z.coerce.number().int().optional(),
  endsAt: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: '% off', FIXED_AMOUNT: '$ off', FREE_SHIPPING: 'Free shipping',
}

export default function DiscountList() {
  const [discounts, setDiscounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'PERCENTAGE', value: 10 },
  })
  const type = watch('type')

  const load = async () => {
    setLoading(true)
    const res = await api.get('/api/admin/discounts')
    setDiscounts(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    setError('')
    try {
      await api.post('/api/admin/discounts', {
        ...data,
        code: data.code.toUpperCase(),
        minOrderAmount: data.minOrderAmount || null,
        maxUses: data.maxUses || null,
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
      })
      reset()
      setShowForm(false)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Failed to create discount')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return
    await api.delete(`/api/admin/discounts/${id}`)
    await load()
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await api.put(`/api/admin/discounts/${id}`, { isActive: !isActive })
    await load()
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discounts</h1>
          <p className="text-sm text-muted-foreground">{discounts.length} codes</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> New code</>}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>New discount code</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Code *</Label>
                  <Input placeholder="e.g. SUMMER20" {...register('code')} className="uppercase" />
                  {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Type *</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...register('type')}>
                    <option value="PERCENTAGE">Percentage off</option>
                    <option value="FIXED_AMOUNT">Fixed amount off</option>
                    <option value="FREE_SHIPPING">Free shipping</option>
                  </select>
                </div>
                {type !== 'FREE_SHIPPING' && (
                  <div className="space-y-1.5">
                    <Label>{type === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount ($)'} *</Label>
                    <Input type="number" step="0.01" placeholder="10" {...register('value')} />
                    {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Min. order amount ($)</Label>
                  <Input type="number" step="0.01" placeholder="Optional" {...register('minOrderAmount')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max uses</Label>
                  <Input type="number" placeholder="Unlimited" {...register('maxUses')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expires</Label>
                  <Input type="datetime-local" {...register('endsAt')} />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create code'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Discount</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Uses</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expires</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(3)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>)
            ) : discounts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No discount codes yet.</td></tr>
            ) : discounts.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium">{d.code}</td>
                <td className="px-4 py-3">
                  {d.type === 'FREE_SHIPPING' ? 'Free shipping'
                    : d.type === 'PERCENTAGE' ? `${d.value}% off`
                    : `$${d.value} off`}
                  {d.minOrderAmount && <span className="text-xs text-muted-foreground ml-1">(min ${d.minOrderAmount})</span>}
                </td>
                <td className="px-4 py-3">{d.usedCount}{d.maxUses ? ` / ${d.maxUses}` : ''}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.endsAt ? formatDate(d.endsAt) : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggle(d.id, d.isActive)}>
                    <Badge variant={d.isActive ? 'success' : 'secondary'}>{d.isActive ? 'Active' : 'Disabled'}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(d.id, d.code)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
