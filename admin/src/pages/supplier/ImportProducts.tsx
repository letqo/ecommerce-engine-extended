import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Download, PackagePlus, ExternalLink, Link2, CheckCircle2, AlertCircle, Eye, EyeOff, TriangleAlert, Settings } from 'lucide-react'

const AE_OAUTH_URL = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=https://example.com&client_id=537274`

interface SupplierVariant {
  supplierId: string
  title: string
  options: Record<string, string>
  costPrice: number
  imageUrl?: string
  stock?: number
}

interface SupplierProduct {
  supplierId: string
  supplierName: string
  title: string
  description: string
  images: string[]
  variants: SupplierVariant[]
  categoryName?: string
  weight?: number
  marketAvailability?: Record<string, boolean>
  deliveryNote?: string | null
  shippingCost?: number
}

interface SupplierCapabilities {
  search: boolean
  productImport: boolean
  orderSubmission: boolean
  trackingPolling: boolean
  webhooks: boolean
  marketAvailability: boolean
}

interface ConfigurableSupplierRow {
  key: string
  displayName: string
  capabilities: SupplierCapabilities
  enabled: boolean
  configured: boolean
}

// CJ and AliExpress are the two built-in suppliers with dedicated flows (CJ needs nothing to
// connect; AliExpress needs the OAuth/paste-code dance below). Every other supplier
// (Printful/Gelato/BigBuy/WooBridge, and any added later) is "configurable" — set up per store
// in Admin → Integrations — and its tab here is driven entirely by GET /store-suppliers, so a
// newly-enabled supplier just appears with no frontend change.
const BUILTIN_SUPPLIERS = [
  { key: 'cj', label: 'CJ Dropshipping' },
  { key: 'aliexpress', label: 'AliExpress' },
]

export default function ImportProducts() {
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('cj')
  const [aliConnected, setAliConnected] = useState<boolean | null>(null)
  const [aliUrl, setAliUrl] = useState('')
  const [aliUrlError, setAliUrlError] = useState('')
  const [configurableSuppliers, setConfigurableSuppliers] = useState<ConfigurableSupplierRow[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SupplierProduct | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [markup, setMarkup] = useState(2.5)
  const [listVariantsIndividually, setListVariantsIndividually] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
  const [importError, setImportError] = useState('')
  const [searchError, setSearchError] = useState('')

  // Gelato has no "my products" concept — search browses one catalog at a time (apparel,
  // posters, cards, ...). Fetched live from Gelato's own List Catalogs endpoint so the picker
  // never goes stale, rather than a hardcoded guess at catalog names.
  const [gelatoCatalogs, setGelatoCatalogs] = useState<{ catalogUid: string; title: string }[]>([])
  const [gelatoCatalogUid, setGelatoCatalogUid] = useState('')
  const [gelatoCatalogsLoading, setGelatoCatalogsLoading] = useState(false)
  const [gelatoCatalogsError, setGelatoCatalogsError] = useState('')

  // AliExpress connect flow
  const [showConnectFlow, setShowConnectFlow] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [connectSaving, setConnectSaving] = useState(false)
  const [connectError, setConnectError] = useState('')

  useEffect(() => {
    api.get('/api/admin/supplier/aliexpress/status').then((r) => setAliConnected(r.data.data.connected))
    api.get('/api/admin/store').then((r) => {
      const val = r.data.data?.defaultImportMarkup
      if (typeof val === 'number' && val > 0) setMarkup(val)
    })
    api.get('/api/admin/store-suppliers').then((r) => {
      const rows = (r.data.data as any[]).map((s) => ({
        key: s.key as string,
        displayName: s.displayName as string,
        capabilities: s.capabilities as SupplierCapabilities,
        enabled: s.enabled as boolean,
        configured: s.configured as boolean,
      }))
      setConfigurableSuppliers(rows)
    })
    // Show success banner if redirected back from OAuth
    if (window.location.search.includes('aliexpress=connected')) {
      setSupplier('aliexpress')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const tabs = useMemo(() => [
    ...BUILTIN_SUPPLIERS.map((s) => ({ ...s, kind: 'builtin' as const, ready: true, capabilities: null as SupplierCapabilities | null })),
    ...configurableSuppliers.map((s) => ({
      key: s.key.toLowerCase(),
      label: s.displayName,
      kind: 'configurable' as const,
      ready: s.enabled && s.configured,
      capabilities: s.capabilities,
    })),
  ], [configurableSuppliers])

  const activeTab = tabs.find((t) => t.key === supplier)

  // Fetch the real catalog list the first time the Gelato tab becomes usable — not on every
  // render, and not for stores that never touch Gelato.
  useEffect(() => {
    if (supplier !== 'gelato' || !activeTab?.ready || gelatoCatalogs.length > 0 || gelatoCatalogsLoading) return
    setGelatoCatalogsLoading(true)
    setGelatoCatalogsError('')
    api.get('/api/admin/supplier/gelato/catalogs')
      .then((r) => {
        const rows = r.data.data as { catalogUid: string; title: string }[]
        setGelatoCatalogs(rows)
        if (rows.length > 0) setGelatoCatalogUid((current) => current || rows[0].catalogUid)
      })
      .catch((e: any) => setGelatoCatalogsError(e.response?.data?.error?.message ?? 'Could not load Gelato catalogs'))
      .finally(() => setGelatoCatalogsLoading(false))
  }, [supplier, activeTab?.ready])

  const loadAliExpressUrl = async () => {
    if (!aliUrl.trim()) return
    setAliUrlError('')
    setLoadingDetail(true)
    setSelected(null)
    setImported(false)
    try {
      const res = await api.get(`/api/admin/supplier/product/${encodeURIComponent(aliUrl.trim())}?supplier=aliexpress`)
      setSelected(res.data.data)
    } catch (e: any) {
      setAliUrlError(e.response?.data?.error?.message ?? 'Failed to load product. Check the URL and try again.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const catalogParam = supplier === 'gelato' && gelatoCatalogUid ? `&catalogUid=${encodeURIComponent(gelatoCatalogUid)}` : ''

  const search = async (p = 1) => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const res = await api.get(`/api/admin/supplier/search?q=${encodeURIComponent(query.trim())}&page=${p}&supplier=${supplier}${catalogParam}`)
      const incoming = res.data.data.products as SupplierProduct[]
      setResults(p === 1 ? incoming : [...results, ...incoming])
      setTotal(res.data.data.total ?? 0)
      setPage(p)
    } catch (e: any) {
      setSearchError(e.response?.data?.error?.message ?? e.message ?? 'Search failed')
      if (p === 1) setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSelect = async (product: SupplierProduct) => {
    setImported(false)
    setSelected(null)
    setLoadingDetail(true)
    try {
      const res = await api.get(`/api/admin/supplier/product/${product.supplierId}?supplier=${supplier}${catalogParam}`)
      setSelected(res.data.data)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleImport = async () => {
    if (!selected) return
    setImporting(true)
    setImportError('')
    try {
      await api.post('/api/admin/supplier/import', {
        supplierId: selected.supplierId,
        supplierName: selected.supplierName,
        title: selected.title,
        description: selected.description,
        markup,
        images: selected.images.slice(0, 8),
        variants: selected.variants,
        videoUrl: (selected as any).videoUrl ?? null,
        deliveryMinDays: (selected as any).deliveryMinDays ?? null,
        deliveryMaxDays: (selected as any).deliveryMaxDays ?? null,
        shippingCost: selected.shippingCost ?? null,
        listVariantsIndividually,
        unavailableMarkets: Object.entries(selected.marketAvailability ?? {})
          .filter(([, available]) => !available)
          .map(([country]) => country),
        deliveryNote: selected.deliveryNote ?? null,
      })
      setImported(true)
    } catch (e: any) {
      setImportError(e.response?.data?.error?.message ?? 'Import failed — check backend logs')
    } finally {
      setImporting(false)
    }
  }

  const handleConnectSave = async () => {
    if (!authCode.trim()) return
    setConnectSaving(true)
    setConnectError('')
    try {
      await api.post('/api/admin/supplier/aliexpress/exchange', { code: authCode.trim() })
      setAliConnected(true)
      setShowConnectFlow(false)
      setAuthCode('')
    } catch (e: any) {
      setConnectError(e.response?.data?.error?.message ?? 'Failed to connect. Double-check the code and try again.')
    } finally {
      setConnectSaving(false)
    }
  }

  const costs = selected?.variants.map((v) => v.costPrice).filter((p) => p > 0) ?? []
  const lowestCost = costs.length > 0 ? Math.min(...costs) : 0
  const shippingCost = selected?.shippingCost ?? 0
  const landedCost = lowestCost + shippingCost
  const suggestedPrice = Math.round(landedCost * markup * 100) / 100

  // BigBuy has no keyword search — the one lookup it supports is by exact SKU. Every other
  // searchable supplier (CJ, WooBridge, and Printful/Gelato with their catalog-scoped caveats)
  // gets the normal catalog-search copy.
  const searchIsExactLookup = activeTab?.capabilities?.search === false

  const switchSupplier = (key: string) => {
    setSupplier(key)
    setResults([])
    setSelected(null)
    setTotal(0)
    setSearchError('')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: search + grid */}
      <div className="flex-1 flex flex-col min-w-0 border-r">
        <div className="p-6 border-b bg-white flex-shrink-0">
          <h1 className="text-2xl font-bold mb-1">Import Products</h1>

          {/* Supplier selector */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {tabs.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => switchSupplier(s.key)}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  supplier === s.key
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
              >
                {s.label}
                {s.kind === 'configurable' && !s.ready && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" title="Not set up yet" />
                )}
              </button>
            ))}
          </div>

          {supplier === 'aliexpress' ? (
            <div className="space-y-3">
              {/* Connection status */}
              {aliConnected === true && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  AliExpress account connected
                </div>
              )}

              {aliConnected === false && !showConnectFlow && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    AliExpress account not connected
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={() => setShowConnectFlow(true)}
                  >
                    Connect Account
                  </Button>
                </div>
              )}

              {aliConnected === false && showConnectFlow && (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-blue-900">Connect your AliExpress account</p>

                  <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Make sure your AliExpress developer console has <strong>https://example.com</strong> as the Callback URL</li>
                    <li>Click the button below to log in</li>
                    <li>After login you land on example.com — look at the address bar</li>
                    <li>Copy the value after <code className="bg-blue-100 px-1 rounded">?code=</code> (stop before <code className="bg-blue-100 px-1 rounded">&</code>)</li>
                    <li>Paste it below and click Save</li>
                  </ol>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => window.open(AE_OAUTH_URL, '_blank', 'width=600,height=700')}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open AliExpress login
                  </Button>

                  <div className="relative">
                    <Input
                      type={showCode ? 'text' : 'password'}
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="Paste authorization code here…"
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {connectError && <p className="text-xs text-red-600">{connectError}</p>}

                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleConnectSave} disabled={connectSaving || !authCode.trim()}>
                      {connectSaving ? 'Connecting…' : 'Save & Connect'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowConnectFlow(false); setAuthCode(''); setConnectError('') }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {/* Search bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && aliConnected && search(1)}
                    placeholder="Search AliExpress catalog…"
                    className="pl-9"
                    disabled={!aliConnected}
                  />
                </div>
                <Button onClick={() => search(1)} disabled={searching || !query.trim() || !aliConnected}>
                  {searching ? 'Searching…' : 'Search'}
                </Button>
              </div>
              {total > 0 && (
                <p className="text-xs text-muted-foreground">{total.toLocaleString()} products found</p>
              )}
              {searchError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{searchError}</p>
              )}

              {/* URL import fallback */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={aliUrl}
                    onChange={(e) => setAliUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAliExpressUrl()}
                    placeholder="Or paste a product URL / ID directly…"
                    className="pl-9"
                    disabled={!aliConnected}
                  />
                </div>
                <Button variant="outline" onClick={loadAliExpressUrl} disabled={!aliUrl.trim() || loadingDetail || !aliConnected}>
                  {loadingDetail ? 'Loading…' : 'Load'}
                </Button>
              </div>
              {aliUrlError && <p className="text-xs text-red-600">{aliUrlError}</p>}
            </div>
          ) : activeTab?.kind === 'configurable' && !activeTab.ready ? (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {activeTab.label} isn't set up yet for this store
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 gap-1.5"
                onClick={() => navigate('/integrations')}
              >
                <Settings className="w-3.5 h-3.5" />
                Set up in Integrations
              </Button>
            </div>
          ) : (
            <>
              {supplier === 'gelato' && (
                <div className="mb-2">
                  {gelatoCatalogsError ? (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{gelatoCatalogsError}</p>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Catalog — Gelato has no "my products" list, it's one shared catalog per product type
                      </label>
                      <select
                        value={gelatoCatalogUid}
                        onChange={(e) => { setGelatoCatalogUid(e.target.value); setResults([]); setSelected(null); setTotal(0) }}
                        disabled={gelatoCatalogsLoading || gelatoCatalogs.length === 0}
                        className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm bg-white disabled:opacity-50"
                      >
                        {gelatoCatalogsLoading && <option>Loading catalogs…</option>}
                        {!gelatoCatalogsLoading && gelatoCatalogs.length === 0 && <option>No catalogs found</option>}
                        {gelatoCatalogs.map((c) => (
                          <option key={c.catalogUid} value={c.catalogUid}>{c.title} ({c.catalogUid})</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search(1)}
                    placeholder={searchIsExactLookup ? 'Enter the exact SKU…' : `Search ${activeTab?.label ?? 'the'} catalog…`}
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => search(1)} disabled={searching || !query.trim()}>
                  {searching ? (searchIsExactLookup ? 'Looking up…' : 'Searching…') : (searchIsExactLookup ? 'Look up' : 'Search')}
                </Button>
              </div>
              {searchIsExactLookup && (
                <p className="text-xs text-muted-foreground mt-2">
                  {activeTab?.label} doesn't support catalog search — look up one product at a time by its exact SKU.
                </p>
              )}
              {total > 0 && !searchIsExactLookup && (
                <p className="text-xs text-muted-foreground mt-2">{total.toLocaleString()} products found on {activeTab?.label}</p>
              )}
              {searchError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{searchError}</p>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Skeletons while first search loads */}
          {searching && results.length === 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="border rounded-xl overflow-hidden">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {results.map((product) => (
                  <button
                    key={product.supplierId}
                    onClick={() => handleSelect(product)}
                    className={`text-left border rounded-xl overflow-hidden transition-all hover:shadow-sm ${
                      selected?.supplierId === product.supplierId
                        ? 'border-black ring-1 ring-black'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div className="aspect-square bg-gray-50">
                      {product.images[0] ? (
                        <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium line-clamp-2 leading-snug">{product.title}</p>
                      {product.categoryName && (
                        <Badge variant="secondary" className="text-xs mt-1.5">{product.categoryName}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {results.length < total && !searchIsExactLookup && (
                <div className="text-center mt-8">
                  <Button variant="outline" onClick={() => search(page + 1)} disabled={searching}>
                    {searching ? 'Loading…' : `Load more (${results.length} / ${total})`}
                  </Button>
                </div>
              )}
            </>
          )}

          {!searching && results.length === 0 && !query && (activeTab?.kind !== 'configurable' || activeTab.ready) && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
              <PackagePlus className="w-14 h-14 mb-4 opacity-15" />
              <p className="font-medium">{searchIsExactLookup ? `Look up a ${activeTab?.label} product` : `Search the ${activeTab?.label ?? ''} catalog`}</p>
              <p className="text-sm mt-1">{searchIsExactLookup ? 'Type its exact SKU and press Enter' : 'Type a product name and press Enter'}</p>
            </div>
          )}

          {!searching && results.length === 0 && query && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
              <Search className="w-14 h-14 mb-4 opacity-15" />
              <p className="font-medium">No results for "{query}"</p>
              <p className="text-sm mt-1">Try different or simpler keywords</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: product detail + import */}
      <div className="w-[22rem] flex-shrink-0 bg-gray-50 flex flex-col overflow-hidden">
        {loadingDetail && (
          <div className="p-5 space-y-4">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {!loadingDetail && !selected && (
          <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground">
            <div>
              <ExternalLink className="w-12 h-12 mx-auto mb-3 opacity-15" />
              <p className="font-medium text-sm">Select a product</p>
              <p className="text-xs mt-1">Click any result to preview and import</p>
            </div>
          </div>
        )}

        {!loadingDetail && selected && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">

              {/* Main image */}
              <div className="aspect-square rounded-xl overflow-hidden bg-white border">
                {selected.images[0]
                  ? <img src={selected.images[0]} alt={selected.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">No image</div>
                }
              </div>

              {/* Thumbnail strip */}
              {selected.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {selected.images.slice(1, 7).map((img, i) => (
                    <img key={i} src={img} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border" />
                  ))}
                </div>
              )}

              {/* Title + category */}
              <div>
                <p className="font-semibold text-sm leading-snug">{selected.title}</p>
                {selected.categoryName && (
                  <Badge variant="secondary" className="text-xs mt-1">{selected.categoryName}</Badge>
                )}
              </div>

              {/* Variants */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Variants ({selected.variants.length})
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {selected.variants.slice(0, 15).map((v) => (
                    <div key={v.supplierId} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border">
                      <span className="truncate text-gray-700 mr-2">
                        {Object.values(v.options).join(' / ') || v.title}
                      </span>
                      <span className="font-semibold text-emerald-700 flex-shrink-0">
                        ${v.costPrice.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {selected.variants.length > 15 && (
                    <p className="text-xs text-muted-foreground px-1">+{selected.variants.length - 15} more</p>
                  )}
                </div>
                {costs.length === 0 && selected.variants.length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    {activeTab?.label} didn't return a cost for this product — set price/cost manually after import.
                  </p>
                )}
              </div>

              {/* Market availability */}
              {selected.marketAvailability && Object.keys(selected.marketAvailability).length > 0 && (
                <div className="bg-white border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ships to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(selected.marketAvailability).map(([country, available]) => (
                      <span
                        key={country}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          available ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {available ? '✓' : '✕'} {country}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Based on your Settings → Target markets.</p>
                </div>
              )}

              {/* Delivery warnings — same note that gets saved on the product at import */}
              {selected.deliveryNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  {selected.deliveryNote.split(' | ').map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
                      <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pricing */}
              <div className="bg-white border rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Item cost (lowest)</span>
                  <span className="font-medium">${lowestCost.toFixed(2)}</span>
                </div>
                {shippingCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping cost (est.)</span>
                    <span className="font-medium">${shippingCost.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-600">Landed cost</span>
                  <span className="font-semibold">${landedCost.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">Markup ×</span>
                  <Input
                    type="number"
                    min="1.1"
                    step="0.1"
                    value={markup}
                    onChange={(e) => setMarkup(parseFloat(e.target.value) || 2)}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-sm font-bold ml-auto text-gray-900">${suggestedPrice.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Profit per unit: <span className="font-medium text-emerald-700">${(suggestedPrice - landedCost).toFixed(2)}</span>
                  {' '}({Math.round(((suggestedPrice - landedCost) / suggestedPrice) * 100)}% margin)
                </p>
                <p className="text-xs text-muted-foreground">
                  {shippingCost > 0
                    ? "Price and cost include the estimated shipping fee the supplier charges you — nothing shown separately to customers."
                    : 'You can edit prices per variant after import.'}
                </p>
              </div>

              {/* Options */}
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="lvi"
                  checked={listVariantsIndividually}
                  onChange={(e) => setListVariantsIndividually(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="lvi" className="cursor-pointer leading-snug">
                  List each variant as a separate product
                </label>
              </div>

              {importError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{importError}</p>
              )}

              {/* Import button */}
              {imported ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-green-800 font-semibold text-sm">Imported as Draft ✓</p>
                  <p className="text-green-700 text-xs mt-1">Go to Products → edit title, description, price, then publish.</p>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  {importing ? 'Importing…' : 'Import to Store'}
                </Button>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
