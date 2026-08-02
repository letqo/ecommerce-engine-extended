import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Play, CreditCard, Truck, CheckCircle2, Search, AlertTriangle } from 'lucide-react'

interface TestState {
  cjOrderId: string | null
  product: string | null
  variant: string | null
  step: 'idle' | 'created' | 'paid' | 'shipped' | 'completed'
  tracking: { trackingNumber?: string; trackingUrl?: string; carrier?: string; status: string } | null
}

export default function SandboxTest() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [stepLoading, setStepLoading] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState<TestState>({ cjOrderId: null, product: null, variant: null, step: 'idle', tracking: null })

  const loadProducts = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<any>('/api/admin/products?limit=100')
      const cjProducts = res.data.filter((p: any) => p.variants?.some(() => true))
      const allProducts = await Promise.all(
        cjProducts.slice(0, 50).map(async (p: any) => {
          const full = await api.get<any>(`/api/admin/products/${p.id}`)
          return full.data
        })
      )
      setProducts(allProducts.filter((p: any) => p.cjProductId))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const createOrder = async (productId: string) => {
    setStepLoading(true)
    setError('')
    try {
      const res = await api.post<any>('/api/admin/sandbox/cj/create', { productId })
      setState({
        cjOrderId: res.data.cjOrderId,
        product: res.data.product,
        variant: res.data.variant,
        step: 'created',
        tracking: null,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }

  const simulatePay = async () => {
    if (!state.cjOrderId) return
    setStepLoading(true)
    setError('')
    try {
      await api.post('/api/admin/sandbox/cj/simulate-pay', { cjOrderId: state.cjOrderId })
      setState((s) => ({ ...s, step: 'paid' }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }

  const updateStatus = async (targetStatus: number, stepName: TestState['step']) => {
    if (!state.cjOrderId) return
    setStepLoading(true)
    setError('')
    try {
      await api.post('/api/admin/sandbox/cj/update-status', { cjOrderId: state.cjOrderId, targetStatus })
      setState((s) => ({ ...s, step: stepName }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }

  const checkTracking = async () => {
    if (!state.cjOrderId) return
    setStepLoading(true)
    setError('')
    try {
      const res = await api.get<any>(`/api/admin/sandbox/cj/check-tracking?cjOrderId=${state.cjOrderId}`)
      setState((s) => ({ ...s, tracking: res.data }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }

  const reset = () => {
    setState({ cjOrderId: null, product: null, variant: null, step: 'idle', tracking: null })
    setError('')
  }

  const steps = [
    { key: 'created', label: 'Order Created', icon: Play },
    { key: 'paid', label: 'Payment Simulated', icon: CreditCard },
    { key: 'shipped', label: 'Shipped', icon: Truck },
    { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  ]
  const currentIdx = steps.findIndex((s) => s.key === state.step)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sandbox Test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Test the full CJ order flow without real money. Creates a sandbox order and simulates each step.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {state.step === 'idle' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select a CJ product to test</CardTitle>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <Button onClick={loadProducts} disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : 'Load CJ products'}
              </Button>
            ) : (
              <div className="space-y-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => createOrder(p.id)}
                    disabled={stepLoading}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <Play className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.variants?.length} variant(s)</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Progress bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                {steps.map((step, i) => {
                  const done = i <= currentIdx
                  const Icon = step.icon
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`text-xs mt-1.5 ${done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Product:</strong> {state.product}</p>
                <p><strong>Variant:</strong> {state.variant}</p>
                <p><strong>CJ Order ID:</strong> <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{state.cjOrderId}</code></p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.step === 'created' && (
                <Button onClick={simulatePay} disabled={stepLoading} className="gap-2">
                  {stepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Simulate Payment
                </Button>
              )}
              {state.step === 'paid' && (
                <Button onClick={() => updateStatus(500, 'shipped')} disabled={stepLoading} className="gap-2">
                  {stepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  Simulate Shipped
                </Button>
              )}
              {state.step === 'shipped' && (
                <div className="space-y-3">
                  <Button onClick={checkTracking} disabled={stepLoading} variant="outline" className="gap-2">
                    {stepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Check Tracking
                  </Button>
                  <Button onClick={() => updateStatus(600, 'completed')} disabled={stepLoading} className="gap-2">
                    {stepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Simulate Completed
                  </Button>
                </div>
              )}
              {state.step === 'completed' && (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Full flow completed successfully!</span>
                </div>
              )}

              {state.tracking && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-blue-900 mb-1">Tracking info from CJ:</p>
                  <p><strong>Status:</strong> {state.tracking.status}</p>
                  <p><strong>Tracking #:</strong> {state.tracking.trackingNumber ?? 'Not yet available'}</p>
                  <p><strong>Carrier:</strong> {state.tracking.carrier ?? 'N/A'}</p>
                  {state.tracking.trackingUrl && <p><strong>URL:</strong> <a href={state.tracking.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{state.tracking.trackingUrl}</a></p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" onClick={reset}>Start over</Button>
        </>
      )}
    </div>
  )
}
