import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, AlertTriangle, X, Pencil } from 'lucide-react'

export default function SyncAlerts() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [dismissing, setDismissing] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await api.get('/api/admin/sync/alerts')
    setProducts(res.data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const pollStatus = async () => {
    const res = await api.get('/api/admin/sync/status')
    const { running, lastResult, lastError } = res.data.data
    if (running) {
      setTimeout(pollStatus, 3000)
      return
    }
    setSyncing(false)
    if (lastError) {
      alert('Sync failed: ' + lastError)
    } else if (lastResult) {
      const { synced, alerts, errors } = lastResult
      alert(`Sync complete — ${synced} synced, ${alerts} alerts, ${errors} errors`)
    }
    await load()
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.post('/api/admin/sync/run')
      setTimeout(pollStatus, 3000)
    } catch (err: any) {
      alert('Sync failed: ' + (err.response?.data?.message || err.message))
      setSyncing(false)
    }
  }

  const handleDismiss = async (id: string) => {
    setDismissing(id)
    await api.post(`/api/admin/sync/dismiss/${id}`)
    setProducts((prev) => prev.filter((p) => p.id !== id))
    setDismissing(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Sync</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} product{products.length !== 1 ? 's' : ''} need attention
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="border rounded-xl bg-white p-12 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg mb-1">All clear</h3>
          <p className="text-muted-foreground text-sm">No supplier sync issues. Products are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const img = p.images?.[0]?.url
            const supplier = p.cjProductId ? 'CJ' : 'AliExpress'
            const isArchived = p.status === 'ARCHIVED'

            return (
              <div key={p.id} className="border rounded-xl bg-white p-4">
                <div className="flex items-start gap-4">
                  {img
                    ? <img src={img} className="w-14 h-14 rounded-lg object-cover border shrink-0" />
                    : <div className="w-14 h-14 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-400 text-xs shrink-0">IMG</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{p.title}</h3>
                      <Badge variant="outline" className="shrink-0">{supplier}</Badge>
                      {isArchived && <Badge variant="secondary" className="shrink-0">Archived</Badge>}
                    </div>
                    <div className="flex items-start gap-2 mt-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700">{p.syncAlert}</p>
                    </div>
                    {p.lastSyncedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last synced: {new Date(p.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/products/${p.id}`)} title="Edit product">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDismiss(p.id)}
                      disabled={dismissing === p.id}
                      title="Dismiss alert"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
