import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, CheckCircle, XCircle, Trash2 } from 'lucide-react'

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
}

const tabs = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
]

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`} />
      ))}
    </div>
  )
}

export default function ReviewList() {
  const [reviews, setReviews] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  const load = async (p = 1, status = tab) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '20' })
    if (status) params.set('status', status)
    const res = await api.get(`/api/admin/reviews?${params}`)
    setReviews(res.data.data)
    setTotal(res.data.meta.total)
    setPages(res.data.meta.pages)
    setPage(p)
    setLoading(false)
  }

  useEffect(() => { load(1) }, [tab])

  const updateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    await api.patch(`/api/admin/reviews/${id}/status`, { status })
    load(page)
  }

  const deleteReview = async (id: string) => {
    if (!confirm('Delete this review permanently?')) return
    await api.delete(`/api/admin/reviews/${id}`)
    load(page)
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-sm text-muted-foreground">{total} total</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.value ? 'border-black text-black' : 'border-transparent text-muted-foreground hover:text-black'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Review</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : reviews.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No reviews found.</td></tr>
            ) : reviews.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.product?.images?.[0]?.url && (
                      <img src={r.product.images[0].url} alt="" className="w-9 h-9 rounded object-cover" />
                    )}
                    <span className="font-medium truncate max-w-[180px]">{r.product?.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[280px]">
                  <Stars rating={r.rating} />
                  {r.title && <p className="font-medium text-xs mt-1 truncate">{r.title}</p>}
                  {r.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs">
                    <p className="font-medium">{r.authorName}</p>
                    <p className="text-muted-foreground">{r.customer?.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusColors[r.status] || 'default'}>{r.status}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {r.status !== 'APPROVED' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => updateStatus(r.id, 'APPROVED')} title="Approve">
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {r.status !== 'REJECTED' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-600" onClick={() => updateStatus(r.id, 'REJECTED')} title="Reject">
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteReview(r.id)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => load(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
