import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import LocalePills, { LOCALES as LOCALE_CODES, LOCALE_LABELS, LocaleCode } from '@/components/LocalePills'
import { ArrowLeft, Loader2, Wand2 } from 'lucide-react'

interface Entry {
  path: string
  source: string
  translated: string
  stale: boolean
}

export default function ThemeTranslations() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [activeLocale, setActiveLocale] = useState<'default' | LocaleCode>(LOCALE_CODES[0])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async (locale: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/admin/themes/${slug}/translations/${locale}`)
      setEntries(res.data.data)
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Failed to load translations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeLocale !== 'default') load(activeLocale)
  }, [activeLocale, slug])

  const updateEntry = (path: string, translated: string) => {
    setEntries((es) => es.map((e) => (e.path === path ? { ...e, translated, stale: false } : e)))
    setSaved(false)
  }

  const handleTranslate = async () => {
    if (activeLocale === 'default') return
    setTranslating(true)
    setError('')
    try {
      const res = await api.post('/api/admin/ai/translate-theme', { slug, targetLocale: activeLocale })
      const draft: Record<string, string> = res.data.data
      setEntries((es) => es.map((e) => (draft[e.path] ? { ...e, translated: draft[e.path], stale: false } : e)))
      setSaved(false)
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'AI translation failed')
    } finally {
      setTranslating(false)
    }
  }

  const handleSave = async () => {
    if (activeLocale === 'default') return
    setSaving(true)
    setError('')
    try {
      const strings: Record<string, string> = {}
      for (const e of entries) {
        if (e.translated.trim()) strings[e.path] = e.translated
      }
      await api.put(`/api/admin/themes/${slug}/translations/${activeLocale}`, { strings })
      await load(activeLocale)
      setSaved(true)
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => navigate('/themes')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold">Translate theme: {slug}</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Only the text below changes per language — layout, links, and images stay the same for every visitor.
      </p>

      <div className="mb-6">
        <LocalePills active={activeLocale} onChange={setActiveLocale} filled={new Set()} />
      </div>

      {activeLocale === 'default' ? (
        <p className="text-sm text-muted-foreground">
          There's nothing to translate here — the "Default" language is the original theme, edited via the JSON upload on the Themes page. Pick a language above to add a translation.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{entries.length} translatable strings</p>
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-violet-300 text-violet-700 rounded-lg text-sm hover:bg-violet-50 transition-colors disabled:opacity-50"
            >
              {translating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {translating ? 'Translating…' : `Generate ${LOCALE_LABELS[activeLocale]} draft`}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-6">This theme has no translatable text.</p>
          ) : (
            <div className="space-y-3 mb-6">
              {entries.map((entry) => (
                <div key={entry.path} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-gray-400">{entry.path}</span>
                    {entry.stale && (
                      <span className="text-[10px] text-amber-600 font-medium">needs re-translation</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{entry.source}</p>
                  <input
                    value={entry.translated}
                    onChange={(e) => updateEntry(entry.path, e.target.value)}
                    placeholder={`Translation in ${LOCALE_LABELS[activeLocale]}`}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || entries.length === 0}
            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save translations'}
          </button>
        </>
      )}
    </div>
  )
}
