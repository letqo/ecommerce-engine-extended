import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Check, Loader2, Upload, Trash2, Plus, X, AlertCircle, Languages } from 'lucide-react'

interface Theme {
  id: string
  slug: string
  name: string
  description?: string | null
  vars: Record<string, string>
  css: string
  sections?: Record<string, unknown> | null
  isBuiltIn: boolean
}

const REQUIRED_VARS = [
  '--primary', '--primary-hover', '--primary-text', '--accent',
  '--hero-bg', '--hero-text', '--hero-sub',
  '--footer-bg', '--footer-text',
  '--font-sans', '--radius-btn', '--radius-card',
]

const VALID_HEADER_VARIANTS = ['default', 'centered', 'overlay', 'two-tier']
const VALID_FOOTER_VARIANTS = ['default', 'minimal', 'newsletter', 'mega']
const VALID_HOME_TYPES = [
  'hero', 'featured-products', 'newsletter', 'brand-statement',
  'categories', 'testimonials', 'trust-badges', 'promo-banner',
  'image-with-text', 'brand-logos', 'new-arrivals', 'best-sellers',
  'countdown', 'faq', 'video', 'blog-posts', 'icon-row',
]
const VALID_PRODUCTS_GRID = ['grid-4', 'grid-3', 'grid-2']
const VALID_PRODUCT_DETAIL = ['side-by-side', 'stacked', 'gallery-sticky']
const VALID_PRODUCT_CARD = ['default', 'overlay', 'detailed']
const VALID_CART_LAYOUT = ['sidebar', 'bottom-bar']
const VALID_CHECKOUT_LAYOUT = ['two-column', 'single-column']

function validateSections(sections: any): string | null {
  if (sections === undefined || sections === null) return null
  if (typeof sections !== 'object') return '"sections" must be an object'
  if (sections.header) {
    if (!sections.header.variant || !VALID_HEADER_VARIANTS.includes(sections.header.variant))
      return `Invalid header variant. Must be one of: ${VALID_HEADER_VARIANTS.join(', ')}`
  }
  if (sections.footer) {
    if (!sections.footer.variant || !VALID_FOOTER_VARIANTS.includes(sections.footer.variant))
      return `Invalid footer variant. Must be one of: ${VALID_FOOTER_VARIANTS.join(', ')}`
  }
  if (sections.home) {
    if (!Array.isArray(sections.home)) return '"sections.home" must be an array'
    if (sections.home.length > 10) return '"sections.home" cannot have more than 10 items'
    for (const item of sections.home) {
      if (!item.type || !VALID_HOME_TYPES.includes(item.type))
        return `Invalid home section type "${item.type}". Must be one of: ${VALID_HOME_TYPES.join(', ')}`
    }
  }
  if (sections.productsGrid && !VALID_PRODUCTS_GRID.includes(sections.productsGrid))
    return `Invalid productsGrid. Must be one of: ${VALID_PRODUCTS_GRID.join(', ')}`
  if (sections.productDetail && !VALID_PRODUCT_DETAIL.includes(sections.productDetail))
    return `Invalid productDetail. Must be one of: ${VALID_PRODUCT_DETAIL.join(', ')}`
  if (sections.productCard && !VALID_PRODUCT_CARD.includes(sections.productCard))
    return `Invalid productCard. Must be one of: ${VALID_PRODUCT_CARD.join(', ')}`
  if (sections.cartLayout && !VALID_CART_LAYOUT.includes(sections.cartLayout))
    return `Invalid cartLayout. Must be one of: ${VALID_CART_LAYOUT.join(', ')}`
  if (sections.checkoutLayout && !VALID_CHECKOUT_LAYOUT.includes(sections.checkoutLayout))
    return `Invalid checkoutLayout. Must be one of: ${VALID_CHECKOUT_LAYOUT.join(', ')}`
  return null
}

function validateThemeJson(json: any): string | null {
  if (!json || typeof json !== 'object') return 'Invalid JSON'
  if (!json.name || typeof json.name !== 'string') return 'Missing "name" field'
  if (!json.vars || typeof json.vars !== 'object') return 'Missing "vars" object'
  const missing = REQUIRED_VARS.filter((k) => !(k in json.vars))
  if (missing.length > 0) return `Missing CSS variables: ${missing.join(', ')}`
  if (json.css && typeof json.css !== 'string') return '"css" must be a string'
  if (json.css && json.css.length > 51200) return 'CSS exceeds 50KB limit'
  const sectionsError = validateSections(json.sections)
  if (sectionsError) return sectionsError
  return null
}

function ThemePreview({ vars }: { vars: Record<string, string> }) {
  const primary = vars['--primary'] ?? '#000'
  const accent = vars['--accent'] ?? '#6366f1'
  const hero = vars['--hero-bg'] ?? '#111827'
  const heroBg = hero.includes('gradient') ? hero : hero
  const btnRadius = vars['--radius-btn'] ?? '0.75rem'

  return (
    <div className="rounded-lg overflow-hidden border border-gray-100">
      <div style={{ background: heroBg }} className="h-12 flex items-center px-3 gap-2">
        <div className="w-16 h-2 rounded-full bg-white opacity-80" />
      </div>
      <div className="bg-white p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded" style={{ background: accent, opacity: 0.25 }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-2 rounded-full bg-gray-200 w-3/4" />
          <div className="h-2 rounded-full bg-gray-100 w-1/2" />
        </div>
        <div
          className="px-3 py-1.5 text-white text-xs font-semibold"
          style={{ background: primary, borderRadius: btnRadius === '9999px' ? '9999px' : '4px' }}
        >
          Buy
        </div>
      </div>
      <div style={{ background: heroBg }} className="h-6" />
    </div>
  )
}

export default function Themes() {
  const navigate = useNavigate()
  const [themes, setThemes] = useState<Theme[]>([])
  const [active, setActive] = useState('default')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchThemes = async () => {
    try {
      const res = await api.get('/api/admin/themes')
      setThemes(res.data.data.themes)
      setActive(res.data.data.activeTheme)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchThemes() }, [])

  const handleActivate = async (slug: string) => {
    if (slug === active || saving) return
    setSaving(slug)
    try {
      await api.put(`/api/admin/themes/${slug}/activate`)
      setActive(slug)
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (slug: string) => {
    if (!confirm(`Delete theme "${slug}"? This cannot be undone.`)) return
    setDeleting(slug)
    try {
      await api.delete(`/api/admin/themes/${slug}`)
      setThemes((t) => t.filter((th) => th.slug !== slug))
    } finally {
      setDeleting(null)
    }
  }

  const handleUpload = async (json: any) => {
    const error = validateThemeJson(json)
    if (error) {
      setUploadError(error)
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const res = await api.post('/api/admin/themes', {
        name: json.name,
        description: json.description ?? '',
        vars: json.vars,
        css: json.css ?? '',
        sections: json.sections ?? undefined,
      })
      setThemes((t) => [...t, res.data.data])
      setShowModal(false)
      setJsonText('')
    } catch (err: any) {
      setUploadError(err.response?.data?.error?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        handleUpload(json)
      } catch {
        setUploadError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handlePasteSubmit = () => {
    try {
      const json = JSON.parse(jsonText)
      handleUpload(json)
    } catch {
      setUploadError('Invalid JSON — check syntax')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Themes</h1>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Themes</h1>
        <button
          onClick={() => { setShowModal(true); setUploadError(''); setJsonText('') }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} /> Add Theme
        </button>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Choose a theme or upload a custom one. Changes take effect within 60 seconds.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {themes.map((theme) => {
          const isActive = active === theme.slug
          const isSaving = saving === theme.slug
          const isDeleting = deleting === theme.slug

          return (
            <div
              key={theme.id}
              className={`
                relative text-left rounded-xl border-2 p-4 transition-all
                ${isActive ? 'border-black shadow-md' : 'border-gray-200 hover:border-gray-400'}
                ${saving && !isSaving ? 'opacity-50' : ''}
              `}
            >
              {/* Status badges */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {theme.isBuiltIn && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Built-in</span>
                )}
                {!theme.isBuiltIn && (
                  <button
                    onClick={() => handleDelete(theme.slug)}
                    disabled={!!deleting}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete theme"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
                {isActive && (
                  <span className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </span>
                )}
                {isSaving && <Loader2 className="w-5 h-5 animate-spin text-gray-500" />}
              </div>

              {/* Click to activate */}
              <button
                onClick={() => handleActivate(theme.slug)}
                disabled={!!saving || isActive}
                className="w-full text-left cursor-pointer disabled:cursor-default"
              >
                <div className="mb-4 pr-16">
                  <ThemePreview vars={theme.vars} />
                </div>
                <p className="font-semibold text-sm mb-0.5">{theme.name}</p>
                <p className="text-xs text-muted-foreground">{theme.description}</p>
                {theme.css && (
                  <p className="text-[10px] text-blue-500 mt-1">+ custom CSS</p>
                )}
                {theme.sections && (
                  <p className="text-[10px] text-purple-500 mt-0.5">+ custom layout</p>
                )}
              </button>

              {/* Color swatches */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-2">
                  <span title="Primary" className="w-5 h-5 rounded-full border border-gray-200" style={{ background: theme.vars['--primary'] }} />
                  <span title="Accent" className="w-5 h-5 rounded-full border border-gray-200" style={{ background: theme.vars['--accent'] }} />
                  <span title="Footer" className="w-5 h-5 rounded-full border border-gray-200" style={{ background: theme.vars['--footer-bg'] }} />
                </div>
                <button
                  onClick={() => navigate(`/themes/${theme.slug}/translations`)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                  title="Manage translations"
                >
                  <Languages size={14} /> Translate
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {active && (
        <p className="mt-6 text-sm text-muted-foreground">
          Active theme: <span className="font-medium text-gray-900 capitalize">{active}</span>
        </p>
      )}

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Custom Theme</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Upload a theme JSON file or paste the JSON below. Use the <strong>THEME_SPEC.md</strong> file with Claude to design themes.
            </p>

            {uploadError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{uploadError}</p>
              </div>
            )}

            {/* File upload */}
            <div className="mb-4">
              <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-gray-300 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                <Upload size={24} className="text-gray-400" />
                <span className="text-sm text-gray-600">Click to upload .json file</span>
              </button>
            </div>

            <div className="relative text-center mb-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <span className="relative bg-white px-3 text-xs text-gray-400">or paste JSON</span>
            </div>

            {/* Paste JSON */}
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={'{\n  "name": "My Theme",\n  "vars": { ... },\n  "css": "..."\n}'}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black resize-none mb-4"
            />

            <button
              onClick={handlePasteSubmit}
              disabled={uploading || !jsonText.trim()}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Save Theme'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
