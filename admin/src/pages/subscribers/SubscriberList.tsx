import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Trash2, Search, Download } from 'lucide-react'

const tabs = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Unsubscribed', value: 'inactive' },
]

const sourceLabels: Record<string, string> = {
  website: 'Newsletter',
  registration: 'Account',
  checkout: 'Checkout',
}

export default function SubscriberList() {
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')

  const load = async (p = 1, status = tab, q = search) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '20' })
    if (status) params.set('status', status)
    if (q.trim()) params.set('search', q.trim())
    const res = await api.get(`/api/admin/subscribers?${params}`)
    setSubscribers(res.data.data)
    setTotal(res.data.meta.total)
    setPages(res.data.meta.pages)
    setPage(p)
    setLoading(false)
  }

  useEffect(() => { load(1) }, [tab])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load(1, tab, search)
  }

  const deleteSubscriber = async (id: string) => {
    if (!confirm('Remove this subscriber?')) return
    await api.delete(`/api/admin/subscribers/${id}`)
    load(page)
  }

  const exportCsv = () => {
    const header = 'Email,Name,Source,Status,Date'
    const rows = subscribers.map((s) =>
      [s.email, s.firstName || '', s.source || '', s.isActive ? 'Active' : 'Unsubscribed', new Date(s.createdAt).toLocaleDateString()].join(',')
    )
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subscribers.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscribers</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={subscribers.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
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
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 h-9"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search className="w-4 h-4" />
          </Button>
        </form>
      </div>

      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subscribed</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : subscribers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No subscribers found.</td></tr>
            ) : subscribers.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium">{s.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.firstName || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="default">{sourceLabels[s.source] || s.source || 'Unknown'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={s.isActive ? 'success' : 'destructive'}>
                    {s.isActive ? 'Active' : 'Unsubscribed'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(s.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteSubscriber(s.id)} title="Remove">
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
