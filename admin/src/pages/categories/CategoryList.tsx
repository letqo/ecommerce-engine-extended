import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2, X, ArrowUp, ArrowDown, Eye, EyeOff, Wand2, Loader2, Upload } from 'lucide-react'
import LocalePills, { LOCALES as LOCALE_CODES, LOCALE_LABELS, LocaleCode } from '@/components/LocalePills'
import ImageStudio from '@/components/ImageStudio'

interface CategoryTranslation {
  locale: string
  name: string | null
  description: string | null
}

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  sortOrder: number
  isVisible: boolean
  _count: { products: number }
  translations?: CategoryTranslation[]
}

interface TranslationSlot {
  locale: string
  name: string
  description: string
}

interface FormState {
  name: string
  slug: string
  description: string
  imageUrl: string
  parentId: string
  isVisible: boolean
  translations: TranslationSlot[]
}

const emptyTranslations = (): TranslationSlot[] => LOCALE_CODES.map((locale) => ({ locale, name: '', description: '' }))

const emptyForm: FormState = { name: '', slug: '', description: '', imageUrl: '', parentId: '', isVisible: true, translations: emptyTranslations() }

export default function CategoryList() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeLocale, setActiveLocale] = useState<'default' | LocaleCode>('default')
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [visibility, setVisibility] = useState('ALL')

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/categories')
      setCategories(res.data.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setActiveLocale('default')
    setStudioOpen(false)
    setShowForm(true)
  }

  const openEdit = (cat: Category) => {
    setEditingId(cat.id)
    const translations = emptyTranslations().map((slot) => {
      const existing = cat.translations?.find((t) => t.locale === slot.locale)
      return existing ? { locale: slot.locale, name: existing.name ?? '', description: existing.description ?? '' } : slot
    })
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      imageUrl: cat.imageUrl ?? '',
      parentId: cat.parentId ?? '',
      isVisible: cat.isVisible,
      translations,
    })
    setError('')
    setActiveLocale('default')
    setStudioOpen(false)
    setShowForm(true)
  }

  const handleTranslate = async () => {
    if (!editingId || activeLocale === 'default') return
    setTranslateLoading(true)
    setTranslateError('')
    try {
      const res = await api.post('/api/admin/ai/translate-category', { categoryId: editingId, targetLocale: activeLocale })
      setForm((f) => ({
        ...f,
        translations: f.translations.map((t) =>
          t.locale === activeLocale ? { ...t, name: res.data.data.name, description: res.data.data.description } : t
        ),
      }))
    } catch (e: any) {
      setTranslateError(e.response?.data?.error?.message || 'Translation failed')
    } finally {
      setTranslateLoading(false)
    }
  }

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post<{ success: boolean; data: { url: string } }>(
        '/api/admin/uploads/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setForm((f) => ({ ...f, imageUrl: res.data.data.url }))
    } catch { alert('Image upload failed') }
    finally { setUploadingImage(false); e.target.value = '' }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        parentId: form.parentId || undefined,
        isVisible: form.isVisible,
        translations: form.translations.filter((t) => t.name.trim() || t.description.trim()),
      }
      if (form.slug.trim()) payload.slug = form.slug.trim()

      if (editingId) {
        await api.put(`/api/admin/categories/${editingId}`, payload)
      } else {
        await api.post('/api/admin/categories', payload)
      }
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Error saving category')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Products in it will become uncategorized.')) return
    try {
      await api.delete(`/api/admin/categories/${id}`)
      load()
    } catch {}
  }

  const handleReorder = async (cat: Category, direction: 'up' | 'down') => {
    const siblings = filteredCategories.filter((c) => c.parentId === cat.parentId)
    const idx = siblings.findIndex((c) => c.id === cat.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const reordered = [...siblings]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    try {
      await Promise.all(reordered.map((c, i) => api.put(`/api/admin/categories/${c.id}`, { sortOrder: i })))
      await load()
    } catch {}
  }

  const toggleVisibility = async (cat: Category) => {
    try {
      await api.put(`/api/admin/categories/${cat.id}`, { isVisible: !cat.isVisible })
      load()
    } catch {}
  }

  const parentOptions = categories.filter((c) => !c.parentId && c.id !== editingId)
  const VIS_TABS = ['ALL', 'VISIBLE', 'HIDDEN']
  const filteredCategories = categories.filter((c) =>
    visibility === 'ALL' ? true : visibility === 'VISIBLE' ? c.isVisible : !c.isVisible
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">{filteredCategories.length} categories</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex border rounded-lg overflow-hidden">
          {VIS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setVisibility(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${visibility === t ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Form panel */}
      {showForm && (
        <div className="border rounded-xl bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editingId ? 'Edit Category' : 'New Category'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <LocalePills
              active={activeLocale}
              onChange={setActiveLocale}
              filled={new Set(form.translations.filter((t) => t.name || t.description).map((t) => t.locale))}
            />
            {activeLocale !== 'default' && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleTranslate} disabled={translateLoading || !editingId}>
                  {translateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {translateLoading ? 'Translating…' : `Translate to ${LOCALE_LABELS[activeLocale]}`}
                </Button>
                {!editingId && <p className="text-xs text-muted-foreground">Save the category first to use AI translation.</p>}
              </div>
            )}
            {translateError && <p className="text-xs text-red-500">{translateError}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeLocale === 'default' ? (
              <>
                <div>
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Electronics" />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated from name" />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.translations.find((t) => t.locale === activeLocale)?.name ?? ''}
                    onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.locale === activeLocale ? { ...t, name: e.target.value } : t)) })}
                    placeholder="Falls back to default name if left blank"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={form.translations.find((t) => t.locale === activeLocale)?.description ?? ''}
                    onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.locale === activeLocale ? { ...t, description: e.target.value } : t)) })}
                    placeholder="Falls back to default if left blank"
                  />
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <Label>Image</Label>
              {form.imageUrl ? (
                <div className="relative group w-28 h-28 rounded-lg overflow-hidden border bg-gray-50">
                  <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => setStudioOpen(true)} title="Open Image Studio">
                      <Wand2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => setForm({ ...form, imageUrl: '' })} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="w-28 h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
                >
                  {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  <span className="text-xs">{uploadingImage ? 'Uploading…' : 'Click to upload'}</span>
                </button>
              )}
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={uploadImage} />
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="or paste an image URL"
                className="mt-2 text-xs h-8"
              />
            </div>

            {studioOpen && form.imageUrl && (
              <ImageStudio
                imageUrl={form.imageUrl}
                onSave={(newUrl) => { setForm((f) => ({ ...f, imageUrl: newUrl })); setStudioOpen(false) }}
                onClose={() => setStudioOpen(false)}
              />
            )}
            <div>
              <Label>Parent Category</Label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">None (top-level)</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isVisible"
              checked={form.isVisible}
              onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="isVisible" className="text-sm">Visible on storefront</label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Parent</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Products</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Visible</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : categories.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No categories yet. Create your first one!</td></tr>
            ) : filteredCategories.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No categories match this filter.</td></tr>
            ) : filteredCategories.map((cat) => {
              const parent = cat.parentId ? categories.find((c) => c.id === cat.parentId) : null
              const siblings = filteredCategories.filter((c) => c.parentId === cat.parentId)
              const siblingIdx = siblings.findIndex((c) => c.id === cat.id)
              return (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={siblingIdx <= 0} onClick={() => handleReorder(cat, 'up')} title="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={siblingIdx === -1 || siblingIdx >= siblings.length - 1} onClick={() => handleReorder(cat, 'down')} title="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt="" className="w-9 h-9 rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                          {cat.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{cat.parentId && <span className="text-muted-foreground mr-1">↳</span>}{cat.name}</p>
                        {cat.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{cat.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{cat.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{parent?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="default">{cat._count.products}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleVisibility(cat)} className="text-gray-400 hover:text-gray-600" title={cat.isVisible ? 'Visible' : 'Hidden'}>
                      {cat.isVisible ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-gray-300" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(cat.id)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
