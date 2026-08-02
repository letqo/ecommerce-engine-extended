import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react'

const ALIEXPRESS_APP_KEY = '537274'
const ALIEXPRESS_OAUTH_URL =
  `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=https://example.com&client_id=${ALIEXPRESS_APP_KEY}`

export default function Integrations() {
  const [cjApiKey, setCjApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // AliExpress token state
  const [aeToken, setAeToken] = useState('')
  const [aeStatus, setAeStatus] = useState<{ connected: boolean; expiry: string | null } | null>(null)
  const [aeSaving, setAeSaving] = useState(false)
  const [aeSaved, setAeSaved] = useState(false)
  const [aeError, setAeError] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/store'),
      api.get('/api/admin/supplier/aliexpress/status'),
    ]).then(([storeRes, aeRes]: any) => {
      if (storeRes.data?.data?.cjApiKey) setCjApiKey(storeRes.data.data.cjApiKey)
      if (aeRes.data?.data) setAeStatus(aeRes.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await api.put('/api/admin/store', { cjApiKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAeToken = async () => {
    if (!aeToken.trim()) return
    setAeSaving(true)
    setAeError('')
    try {
      await api.post('/api/admin/supplier/aliexpress/exchange', { code: aeToken.trim() })
      const statusRes = await api.get('/api/admin/supplier/aliexpress/status')
      setAeStatus(statusRes.data.data)
      setAeToken('')
      setAeSaved(true)
      setShowInstructions(false)
      setTimeout(() => setAeSaved(false), 3000)
    } catch (err: any) {
      setAeError(err?.response?.data?.error?.message ?? 'Failed to connect. Check the code and try again.')
    } finally {
      setAeSaving(false)
    }
  }

  const handleDisconnectAe = async () => {
    setAeSaving(true)
    try {
      await api.post('/api/admin/supplier/aliexpress/token', { token: '', expiresIn: 0 })
      setAeStatus({ connected: false, expiry: null })
    } finally {
      setAeSaving(false)
    }
  }

  const isConfigured = cjApiKey.trim().length > 0

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Integrations</h1>
        <p className="text-muted-foreground text-sm">
          Connect third-party services to power your store's fulfillment.
        </p>
      </div>

      {/* CJ Dropshipping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">CJ Dropshipping</CardTitle>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isConfigured ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={cjApiKey}
                    onChange={(e) => setCjApiKey(e.target.value)}
                    placeholder="CJ5..."
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Found in your CJ Dropshipping account → Developer Portal → API Key
                </p>
              </div>
              <Button onClick={handleSave} disabled={saving || !cjApiKey.trim()}>
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                  : saved
                  ? <><Check className="w-4 h-4 mr-2" /> Saved!</>
                  : 'Save'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* AliExpress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AliExpress Dropshipping</CardTitle>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${aeStatus?.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {aeStatus?.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ) : aeStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  Account connected
                  {aeStatus.expiry && (
                    <span className="text-green-600 ml-1">
                      — expires {new Date(aeStatus.expiry).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnectAe} disabled={aeSaving}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your AliExpress account to import products by URL.
              </p>

              {!showInstructions ? (
                <Button onClick={() => setShowInstructions(true)}>
                  Connect AliExpress account
                </Button>
              ) : (
                <div className="space-y-4">
                  {/* Step-by-step instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3 text-sm">
                    <p className="font-medium text-blue-900">Before continuing — one-time setup:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-blue-800">
                      <li>
                        Go to your{' '}
                        <a
                          href="https://open.aliexpress.com"
                          target="_blank"
                          rel="noreferrer"
                          className="underline inline-flex items-center gap-0.5"
                        >
                          AliExpress developer console <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                      <li>Open your app → find <strong>Callback URL</strong> (or Redirect URI)</li>
                      <li>Set it to: <code className="bg-blue-100 px-1 rounded">https://example.com</code></li>
                      <li>Save</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Then click the button below to log in:</p>
                    <Button
                      variant="outline"
                      onClick={() => window.open(ALIEXPRESS_OAUTH_URL, '_blank', 'width=600,height=700')}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open AliExpress login
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      After logging in, your browser will redirect to example.com. The address bar will look like:
                      <code className="mx-1 bg-gray-100 px-1 rounded text-xs">https://example.com?code=XXXXXX&state=...</code>
                      Copy the value after <code className="bg-gray-100 px-1 rounded">?code=</code> and before the <code className="bg-gray-100 px-1 rounded">&</code>.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Paste the authorization code here</Label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        value={aeToken}
                        onChange={(e) => setAeToken(e.target.value)}
                        placeholder="Paste the code=… value from the URL…"
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      After logging in, look at the address bar. Copy only the value after <code className="bg-gray-100 px-1 rounded">?code=</code> (stop before the <code className="bg-gray-100 px-1 rounded">&</code>).
                    </p>
                  </div>

                  {aeError && (
                    <p className="text-sm text-red-600">{aeError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleSaveAeToken} disabled={aeSaving || !aeToken.trim()}>
                      {aeSaving
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                        : aeSaved
                        ? <><Check className="w-4 h-4 mr-2" /> Connected!</>
                        : 'Save token'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowInstructions(false); setAeToken(''); setAeError('') }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
