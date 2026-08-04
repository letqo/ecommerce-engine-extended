import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Pencil, Trash2, Eye, EyeOff, AlertTriangle, Ban, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_COLORS: Record<string, any> = {
  ACTIVE: 'success', DRAFT: 'secondary', ARCHIVED: 'outline',
}

const TABS = ['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED']

export default function ProductList() {
  const navigate = useNavigate()
  // Filters live in the URL (not local state) so the browser back button and the
  // form's back arrow return to the exact filtered/paged view instead of resetting it.
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || 'ALL'
  const categoryId = searchParams.get('categoryId') || 'ALL'
  const urlSearch = searchParams.get('search') || ''

  const [products, setProducts] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(urlSearch)
  const [categories, setCategories] = useState<any[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace: true })
  }

  const setStatus = (v: string) => updateParams({ status: v === 'ALL' ? null : v, page: null })
  const setCategoryId = (v: string) => updateParams({ categoryId: v === 'ALL' ? null : v, page: null })
  const setPage = (p: number) => updateParams({ page: p <= 1 ? null : String(p) })

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '20', page: String(page) })
    if (urlSearch) params.set('search', urlSearch)
    if (status !== 'ALL') params.set('status', status)
    if (categoryId !== 'ALL') params.set('categoryId', categoryId)
    const res = await api.get(`/api/admin/products?${params}`)
    setProducts(res.data.data)
    setTotal(res.data.meta.total)
    setPages(res.data.meta.pages || 1)
    setLoading(false)
  }

  useEffect(() => { api.get('/api/admin/categories').then((r) => setCategories(r.data.data)) }, [])

  // Keep the search input in sync when the URL changes from outside typing (e.g. browser back).
  useEffect(() => { setSearch(urlSearch) }, [urlSearch])

  useEffect(() => {
    if (search === urlSearch) return
    const t = setTimeout(() => updateParams({ search: search || null, page: null }), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { load() }, [page, status, categoryId, urlSearch])

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    await api.delete(`/api/admin/products/${id}`)
    await load()
    setDeleting(null)
  }

  const handleToggleStatus = async (id: string, current: string) => {
    const next = current === 'ACTIVE' ? 'DRAFT' : 'ACTIVE'
    await api.patch(`/api/admin/products/${id}/status`, { status: next })
    await load()
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Button onClick={() => navigate('/products/new')}>
          <Plus className="w-4 h-4" /> Add product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex border rounded-lg overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${status === t ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-9 rounded-lg border bg-white px-3 text-xs font-medium text-gray-600 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="ALL">All categories</option>
          <option value="__NONE__">Uncategorized</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Price</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Inventory</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : products.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No products found.</td></tr>
            ) : products.map((p) => {
              const price = p.variants?.[0]?.price
              const totalVariants = p.variants?.length ?? 0
              // Made-to-order variants (trackInventory: false) have no real stock count —
              // exclude them from the out-of-stock math instead of reading their qty=0 as a shortage.
              const trackedVariants = p.variants?.filter((v: any) => v.trackInventory) ?? []
              const inventory = trackedVariants.reduce((s: number, v: any) => s + v.inventoryQty, 0)
              const oosCount = trackedVariants.filter((v: any) => v.inventoryQty <= 0).length
              const img = p.images?.[0]?.url
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {img
                        ? <img src={img} className="w-10 h-10 rounded-lg object-cover border" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-400 text-xs">IMG</div>
                      }
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{p.title}</p>
                          {p.syncAlert && (
                            <span title={p.syncAlert}><AlertTriangle className="w-4 h-4 text-amber-500" /></span>
                          )}
                          {p.unavailableMarkets?.length > 0 && (
                            <span title={`Didn't ship to ${p.unavailableMarkets.join(', ')} when imported on ${formatDate(p.createdAt)}`}>
                              <Ban className="w-4 h-4 text-red-500" />
                            </span>
                          )}
                          {p.deliveryNote && (
                            <span title={p.deliveryNote}>
                              <Clock className="w-4 h-4 text-amber-500" />
                            </span>
                          )}
                        </div>
                        {p.category && <p className="text-xs text-muted-foreground">{p.category.name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_COLORS[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{price != null ? formatCurrency(price) : '—'}</td>
                  <td className="px-4 py-3">
                    {trackedVariants.length === 0 && totalVariants > 0 ? (
                      <span className="text-muted-foreground" title="No stock is held — fulfilled per order">Made to order</span>
                    ) : oosCount === trackedVariants.length ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> Out of stock
                      </span>
                    ) : oosCount > 0 ? (
                      <span className="text-amber-600 font-medium" title={`${oosCount} of ${trackedVariants.length} tracked variants out of stock`}>
                        {inventory} <span className="text-xs font-normal">({oosCount} oos)</span>
                      </span>
                    ) : (
                      <span>{inventory}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleStatus(p.id, p.status)} title={p.status === 'ACTIVE' ? 'Set draft' : 'Set active'}>
                        {p.status === 'ACTIVE' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/products/${p.id}`)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(p.id, p.title)} disabled={deleting === p.id}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {pages} — {total} total
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
