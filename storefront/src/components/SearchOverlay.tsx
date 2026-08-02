'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { Search, X, Loader2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? ''

interface Result {
  id: string
  slug: string
  title: string
  images?: { url: string }[]
  variants: { price: number; compareAtPrice?: number | null }[]
}

export default function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const currency = useCurrency()
  const locale = useLocale()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const doSearch = (q: string) => {
    clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/store/search?q=${encodeURIComponent(q)}`, {
          headers: { 'X-Store-Id': STORE_ID, 'X-Locale': locale },
        })
        if (!res.ok) { setResults([]); return }
        const json = await res.json()
        setResults(json.data ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    doSearch(v)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 2) {
      onClose()
      router.push(`/products?search=${encodeURIComponent(query.trim())}`)
    }
  }

  const handleResultClick = (slug: string) => {
    onClose()
    router.push(`/products/${slug}`)
  }

  if (!open) return null

  return (
    <div data-theme-section="search-overlay" className="theme-search-overlay fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="theme-search-panel relative bg-white w-full max-w-2xl mx-auto mt-0 sm:mt-20 sm:rounded-2xl shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit} className="theme-search-input-row flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search size={20} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Search products..."
            className="theme-search-input flex-1 text-lg outline-none bg-transparent placeholder:text-gray-400"
          />
          {loading && <Loader2 size={18} className="animate-spin text-gray-400" />}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </form>

        <div className="theme-search-results max-h-[60vh] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              No products found for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((product) => {
            const image = product.images?.[0]?.url ?? '/placeholder.jpg'
            const price = product.variants?.[0]?.price ?? 0
            const compareAt = product.variants?.[0]?.compareAtPrice

            return (
              <button
                key={product.id}
                onClick={() => handleResultClick(product.slug)}
                className="theme-search-result w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <Image src={image} alt={product.title} width={56} height={56} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-semibold text-gray-900">{formatPrice(price, currency)}</span>
                    {compareAt != null && compareAt > 0 && compareAt > price && (
                      <span className="text-xs text-gray-400 line-through">{formatPrice(compareAt, currency)}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {query.length >= 2 && results.length > 0 && (
            <button
              onClick={handleSubmit}
              className="theme-search-view-all w-full px-5 py-3 text-sm font-medium text-center text-primary hover:bg-gray-50 border-t border-gray-100"
            >
              View all results for &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
