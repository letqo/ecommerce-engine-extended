import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Loader2, Eye, EyeOff, ExternalLink, Copy } from 'lucide-react'

// Per-store supplier integrations (Printful, Gelato, BigBuy, and the generic WooCommerce
// bridge). Everything on this screen — which suppliers exist, what each can do, which settings
// it needs — comes from the backend's supplier registry, so adding a supplier there makes it
// appear here with no change to this file.

interface SettingField {
  name: string
  label: string
  help?: string
  required: boolean
  secret: boolean
  placeholder?: string
}

interface Capabilities {
  search: boolean
  productImport: boolean
  orderSubmission: boolean
  trackingPolling: boolean
  webhooks: boolean
  marketAvailability: boolean
}

interface StoreSupplier {
  key: string
  displayName: string
  description: string
  docsUrl?: string
  capabilities: Capabilities
  settingFields: SettingField[]
  enabled: boolean
  configured: boolean
  missingRequired: string[]
  settings: Record<string, string>
  webhookUrl?: string
  updatedAt: string | null
}

const CAPABILITY_LABELS: { key: keyof Capabilities; label: string }[] = [
  { key: 'search', label: 'Catalog search' },
  { key: 'productImport', label: 'Product import' },
  { key: 'orderSubmission', label: 'Automatic orders' },
  { key: 'trackingPolling', label: 'Tracking updates' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'marketAvailability', label: 'Shipping checks' },
]

export default function StoreSuppliers() {
  const [suppliers, setSuppliers] = useState<StoreSupplier[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await api.get('/api/admin/store-suppliers')
      setSuppliers(res.data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {suppliers.map((s) => (
        <SupplierCard key={s.key} supplier={s} onSaved={load} />
      ))}
    </>
  )
}

function SupplierCard({ supplier, onSaved }: { supplier: StoreSupplier; onSaved: () => void }) {
  // Secrets arrive masked ("••••1234"). Leaving the mask in the input and sending it back
  // untouched tells the server "keep what you have" — see the PUT route.
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...supplier.settings }))
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [urlCopied, setUrlCopied] = useState(false)

  const copyWebhookUrl = () => {
    if (!supplier.webhookUrl) return
    navigator.clipboard.writeText(supplier.webhookUrl)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }

  useEffect(() => { setValues({ ...supplier.settings }) }, [supplier.settings])

  const save = async (enabled: boolean) => {
    setSaving(true)
    setError('')
    try {
      await api.put('/api/admin/store-suppliers', { supplierKey: supplier.key, enabled, settings: values })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Could not save. Check the fields and try again.')
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = supplier.enabled ? 'Enabled' : supplier.configured ? 'Configured' : 'Not configured'
  const statusClass = supplier.enabled
    ? 'bg-green-100 text-green-700'
    : supplier.configured
    ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-500'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{supplier.displayName}</CardTitle>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{supplier.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {CAPABILITY_LABELS.filter((c) => supplier.capabilities[c.key]).map((c) => (
            <span key={c.key} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {c.label}
            </span>
          ))}
        </div>

        {supplier.docsUrl && (
          <a
            href={supplier.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 underline inline-flex items-center gap-0.5"
          >
            Supplier API documentation <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {!expanded ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
              {supplier.configured ? 'Edit settings' : 'Set up'}
            </Button>
            {supplier.enabled && (
              <Button variant="ghost" size="sm" onClick={() => save(false)} disabled={saving}>
                Disable
              </Button>
            )}
            {!supplier.enabled && supplier.configured && (
              <Button size="sm" onClick={() => save(true)} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enabling…</> : 'Enable'}
              </Button>
            )}
            {!supplier.configured && supplier.missingRequired.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Needs: {supplier.missingRequired.join(', ')}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-4 border-t pt-4">
            {supplier.settingFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label>
                  {field.label}
                  {!field.required && <span className="text-muted-foreground font-normal"> (optional)</span>}
                </Label>
                <div className="relative">
                  <Input
                    type={field.secret && !revealed[field.name] ? 'password' : 'text'}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    placeholder={field.placeholder}
                    className={field.secret ? 'pr-10 font-mono text-sm' : 'text-sm'}
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [field.name]: !r[field.name] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {revealed[field.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}

            {supplier.webhookUrl && (
              <div className="space-y-1.5">
                <Label>Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
                    {supplier.webhookUrl}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={copyWebhookUrl} className="shrink-0">
                    {urlCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste this into {supplier.displayName}'s webhook settings so shipping updates arrive automatically
                  instead of waiting for the periodic sync.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Saved keys are never shown again — an existing one appears as ••••1234. Leave it as-is to keep it,
              or type a new value to replace it.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(true)} disabled={saving}>
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                  : saved
                  ? <><Check className="w-4 h-4 mr-2" /> Saved!</>
                  : 'Save & enable'}
              </Button>
              <Button variant="outline" onClick={() => save(false)} disabled={saving}>
                Save without enabling
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setExpanded(false); setValues({ ...supplier.settings }); setError('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
