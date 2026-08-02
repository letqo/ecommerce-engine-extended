import { useState } from 'react'
import { api } from '@/lib/api'
import { useStoreContext } from '@/stores/storeContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Store, Plus, Check, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar' },
  { code: 'BRL', symbol: 'R$', label: 'BRL — Brazilian Real' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN — Mexican Peso' },
  { code: 'SEK', symbol: 'kr', label: 'SEK — Swedish Krona' },
  { code: 'PLN', symbol: 'zł', label: 'PLN — Polish Zloty' },
  { code: 'AED', symbol: 'د.إ', label: 'AED — UAE Dirham' },
  { code: 'SGD', symbol: 'S$', label: 'SGD — Singapore Dollar' },
  { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen' },
  { code: 'INR', symbol: '₹', label: 'INR — Indian Rupee' },
  { code: 'CHF', symbol: 'CHF', label: 'CHF — Swiss Franc' },
]

const COUNTRIES = [
  { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' }, { code: 'AU', label: 'Australia' },
  { code: 'FR', label: 'France' }, { code: 'DE', label: 'Germany' },
  { code: 'IT', label: 'Italy' }, { code: 'ES', label: 'Spain' },
  { code: 'NL', label: 'Netherlands' }, { code: 'SE', label: 'Sweden' },
  { code: 'PL', label: 'Poland' }, { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' }, { code: 'AE', label: 'UAE' },
  { code: 'SG', label: 'Singapore' }, { code: 'JP', label: 'Japan' },
  { code: 'IN', label: 'India' }, { code: 'ZA', label: 'South Africa' },
]

export default function Stores() {
  const { stores, activeStore, switchStore, refreshStores } = useStoreContext()
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    currency: 'USD',
    currencySymbol: '$',
    shipToCountry: 'US',
    sourcingCurrency: 'USD',
  })

  const handleCurrencyChange = (code: string) => {
    const c = CURRENCIES.find((x) => x.code === code)
    setForm((f) => ({ ...f, currency: code, currencySymbol: c?.symbol ?? '$', sourcingCurrency: code }))
  }

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Store name is required'); return }
    setSaving(true)
    setError('')
    try {
      await api.post('/api/admin/store/create', form)
      await refreshStores()
      setCreating(false)
      setForm({ name: '', currency: 'USD', currencySymbol: '$', shipToCountry: 'US', sourcingCurrency: 'USD' })
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Failed to create store')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Each store targets a different country market.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New store
        </Button>
      </div>

      {/* Store list */}
      <div className="space-y-3">
        {stores.map((store) => (
          <Card
            key={store.id}
            className={cn('cursor-pointer transition-all', store.id === activeStore?.id && 'ring-2 ring-indigo-500')}
            onClick={() => switchStore(store.id)}
          >
            <CardContent className="flex items-center gap-4 py-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{store.name}</p>
                <p className="text-sm text-muted-foreground">
                  {COUNTRIES.find((c) => c.code === store.shipToCountry)?.label ?? store.shipToCountry} · {store.currency}
                </p>
              </div>
              {store.id === activeStore?.id && (
                <div className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium">
                  <Check className="w-4 h-4" /> Active
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create store form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> New store</CardTitle>
            <CardDescription>Set up a new storefront targeting a specific country market.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Store name</Label>
              <Input
                placeholder="e.g. Your Store Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Storefront currency</Label>
                <select
                  value={form.currency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Ship-to country</Label>
                <select
                  value={form.shipToCountry}
                  onChange={(e) => setForm((f) => ({ ...f, shipToCountry: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create store'}
              </Button>
              <Button variant="ghost" onClick={() => { setCreating(false); setError('') }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
