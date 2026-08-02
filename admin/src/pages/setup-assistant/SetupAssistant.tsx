import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, Send, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string }>
}

interface PendingConfirm {
  method: 'PUT' | 'PATCH' | 'POST' | 'DELETE'
  path: string
  body?: any
  label: string
  description: string
}

interface AssistantAction {
  tool: string
  summary: string
  pendingConfirm?: PendingConfirm
}

interface DisplayTurn {
  role: 'user' | 'assistant'
  text: string
  actions?: AssistantAction[]
  isError?: boolean
}

function extractText(content: AnthropicMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim()
}

// The persisted transcript includes tool_use/tool_result turns from the
// agent loop — only user messages and the assistant's final text per turn
// are worth showing; anything else collapses to nothing here.
function toDisplayTurns(history: AnthropicMessage[]): DisplayTurn[] {
  const turns: DisplayTurn[] = []
  for (const m of history) {
    const text = extractText(m.content)
    if (!text) continue
    turns.push({ role: m.role, text })
  }
  return turns
}

function ActionCard({ action }: { action: AssistantAction }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  if (action.pendingConfirm) {
    const { method, path, body, label, description } = action.pendingConfirm
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
        <div className="flex items-start gap-2 text-sm text-amber-900 mb-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{description}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={confirmed ? 'outline' : 'default'}
            disabled={confirming || confirmed}
            onClick={async () => {
              setConfirming(true)
              setError('')
              try {
                await (api as any)[method.toLowerCase()](path, body)
                setConfirmed(true)
              } catch (e: any) {
                setError(e.response?.data?.error?.message || 'Failed — try again.')
              } finally {
                setConfirming(false)
              }
            }}
          >
            {confirming ? <Loader2 size={14} className="animate-spin" /> : confirmed ? 'Done ✓' : label}
          </Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-gray-700">
      <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
      {action.summary}
    </div>
  )
}

export default function SetupAssistant() {
  const [turns, setTurns] = useState<DisplayTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resuming, setResuming] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/api/admin/setup-assistant/session')
      .then((res) => setTurns(toDisplayTurns(res.data.data.messages ?? [])))
      .catch(() => {})
      .finally(() => setResuming(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, loading])

  const send = async () => {
    const message = input.trim()
    if (!message || loading) return
    setInput('')
    setTurns((t) => [...t, { role: 'user', text: message }])
    setLoading(true)
    try {
      const res = await api.post('/api/admin/setup-assistant/message', { message })
      const { reply, actions } = res.data.data
      setTurns((t) => [...t, { role: 'assistant', text: reply, actions }])
    } catch (e: any) {
      const message = e.response?.data?.error?.message || 'Something went wrong and your message didn\'t go through — no changes were made. Try again, or try a smaller request.'
      setTurns((t) => [...t, { role: 'assistant', text: message, isError: true }])
    } finally {
      setLoading(false)
    }
  }

  const startOver = async () => {
    if (!confirm('Start a new conversation? This clears the current one.')) return
    await api.delete('/api/admin/setup-assistant/session')
    setTurns([])
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            Setup Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe what you need — settings, products, orders, discounts, blog, and more. I'll handle it as we talk.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={startOver}>
          <RotateCcw size={14} className="mr-1.5" />
          Start over
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {resuming ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : turns.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              Tell me about your store — what you're selling, who it's for, and where you're sourcing products from.
            </div>
          ) : (
            turns.map((turn, i) => (
              <div key={i} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={turn.role === 'user' ? 'max-w-[80%]' : 'max-w-[85%] w-full'}>
                  <div
                    className={
                      turn.role === 'user'
                        ? 'bg-black text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap'
                        : turn.isError
                        ? 'bg-red-50 border border-red-200 text-red-800 rounded-2xl rounded-bl-sm px-4 py-2 text-sm whitespace-pre-wrap flex items-start gap-2'
                        : 'bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 text-sm whitespace-pre-wrap'
                    }
                  >
                    {turn.isError && <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />}
                    <span>{turn.text}</span>
                  </div>
                  {turn.actions && turn.actions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {turn.actions.map((action, j) => (
                        <ActionCard key={j} action={action} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t px-6 py-4 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="e.g. I'm starting a minimalist skincare store, shipping from Germany…"
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
          />
          <Button type="button" onClick={send} disabled={loading || !input.trim()}>
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
