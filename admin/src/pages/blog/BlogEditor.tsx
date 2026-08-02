import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import RichTextEditor from '@/components/editor/RichTextEditor'
import { ArrowLeft, Eye, EyeOff, Save, Trash2, Upload, X, Sparkles, Loader2 } from 'lucide-react'

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface FormState {
  title: string
  slug: string
  content: string
  excerpt: string
  coverImage: string
  seoTitle: string
  seoDescription: string
  tags: string[]
}

const EMPTY: FormState = {
  title: '', slug: '', content: '', excerpt: '',
  coverImage: '', seoTitle: '', seoDescription: '', tags: [],
}

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [status, setStatus] = useState('DRAFT')
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)
  const [topic, setTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  useEffect(() => {
    if (!isNew && id) {
      api.get(`/api/admin/blog/${id}`).then((res) => {
        const p = res.data.data
        setForm({
          title: p.title ?? '',
          slug: p.slug ?? '',
          content: p.content ?? '',
          excerpt: p.excerpt ?? '',
          coverImage: p.coverImage ?? '',
          seoTitle: p.seoTitle ?? '',
          seoDescription: p.seoDescription ?? '',
          tags: p.tags ?? [],
        })
        setStatus(p.status)
        setSlugManual(true)
      }).catch(() => navigate('/blog'))
    }
  }, [id])

  const set = (key: keyof FormState, value: string | string[]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleTitleChange = (value: string) => {
    set('title', value)
    if (!slugManual) set('slug', slugify(value))
  }

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !form.tags.includes(tag)) set('tags', [...form.tags, tag])
    setTagInput('')
  }

  const removeTag = (tag: string) => set('tags', form.tags.filter((t) => t !== tag))

  const generateDraft = async () => {
    if (!topic.trim() || generating) return
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await api.post('/api/admin/ai/blog-draft', { topic: topic.trim() })
      const draft = res.data.data
      setForm((f) => ({
        ...f,
        title: draft.title,
        content: draft.content,
        excerpt: draft.excerpt,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        tags: draft.tags,
      }))
      set('slug', slugify(draft.title))
      setSlugManual(true)
    } catch (err: any) {
      setGenerateError(err.response?.data?.error?.message || 'Generation failed — try again.')
    } finally {
      setGenerating(false)
    }
  }

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post<{ success: boolean; data: { url: string } }>(
        '/api/admin/uploads/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      set('coverImage', res.data.data.url)
    } catch { alert('Cover image upload failed') }
    finally { setUploadingCover(false); e.target.value = '' }
  }

  const save = async (publish?: boolean) => {
    if (!form.title.trim()) { alert('Title is required'); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        content: form.content,
        excerpt: form.excerpt || undefined,
        coverImage: form.coverImage || undefined,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        tags: form.tags,
      }

      let savedId = id
      if (isNew) {
        const res = await api.post('/api/admin/blog', payload)
        savedId = res.data.data.id
      } else {
        await api.put(`/api/admin/blog/${id}`, payload)
      }

      if (publish !== undefined && savedId) {
        const action = publish ? 'publish' : 'unpublish'
        await api.patch(`/api/admin/blog/${savedId}/${action}`)
        setStatus(publish ? 'PUBLISHED' : 'DRAFT')
      }

      if (isNew && savedId) navigate(`/blog/${savedId}`, { replace: true })
    } catch (err: any) {
      alert(err.response?.data?.error?.message ?? 'Save failed')
    } finally { setSaving(false) }
  }

  const deletePost = async () => {
    if (!id || !window.confirm('Delete this post? This cannot be undone.')) return
    await api.delete(`/api/admin/blog/${id}`)
    navigate('/blog')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/blog" className="text-muted-foreground hover:text-gray-900 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <span className="text-sm font-medium text-gray-900">{isNew ? 'New post' : 'Edit post'}</span>
          {!isNew && (
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {status === 'PUBLISHED' ? 'Published' : 'Draft'}
            </span>
          )}
          <div className="flex-1" />
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5" onClick={deletePost}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => save()} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save draft'}
          </Button>
          {status === 'PUBLISHED' ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => save(false)} disabled={saving}>
              <EyeOff size={14} /> Unpublish
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => save(true)} disabled={saving}>
              <Eye size={14} /> Publish
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

        {/* Left — main content */}
        <div className="space-y-4">
          {/* AI draft generator */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
            <p className="text-sm font-medium text-violet-900 mb-2 flex items-center gap-1.5">
              <Sparkles size={14} /> Generate with AI
            </p>
            <div className="flex items-center gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generateDraft() } }}
                placeholder="e.g. 5 tips for choosing the right ceramic mug"
                disabled={generating}
                className="flex-1 text-sm border border-violet-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400 bg-white disabled:opacity-50"
              />
              <Button type="button" size="sm" onClick={generateDraft} disabled={generating || !topic.trim()}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : 'Draft'}
              </Button>
            </div>
            <p className="text-xs text-violet-700 mt-2">Fills in title, content, excerpt, tags, and SEO fields below — nothing is saved until you click Save draft.</p>
            {generateError && <p className="text-xs text-red-600 mt-1">{generateError}</p>}
          </div>

          {/* Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <input
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Post title…"
              className="w-full text-2xl font-bold text-gray-900 placeholder:text-gray-300 border-none outline-none resize-none bg-transparent"
            />
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-muted-foreground">Slug:</span>
              <input
                value={form.slug}
                onChange={(e) => { setSlugManual(true); set('slug', e.target.value) }}
                className="flex-1 text-xs text-muted-foreground bg-gray-50 rounded px-2 py-1 border border-gray-200 outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Editor */}
          <RichTextEditor value={form.content} onChange={(html) => set('content', html)} />
        </div>

        {/* Right — sidebar */}
        <div className="space-y-4">

          {/* Cover image */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Cover image</p>
            {form.coverImage ? (
              <div className="relative group">
                <img src={form.coverImage} alt="" className="w-full h-36 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => set('coverImage', '')}
                  className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                disabled={uploadingCover}
                className="w-full h-28 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-indigo-400 hover:text-indigo-500 transition-colors"
              >
                <Upload size={20} />
                <span className="text-xs">{uploadingCover ? 'Uploading…' : 'Click to upload'}</span>
              </button>
            )}
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={uploadCover} />
          </div>

          {/* Excerpt */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Excerpt</p>
            <textarea
              value={form.excerpt}
              onChange={(e) => set('excerpt', e.target.value)}
              placeholder="Short summary shown in blog listings…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 resize-none placeholder:text-gray-400"
            />
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}><X size={10} /></button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
              placeholder="Add tag, press Enter"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 placeholder:text-gray-400"
            />
          </div>

          {/* SEO */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">SEO</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Meta title</label>
                <input
                  value={form.seoTitle}
                  onChange={(e) => set('seoTitle', e.target.value)}
                  placeholder={form.title || 'Same as title'}
                  maxLength={60}
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">{(form.seoTitle || form.title).length}/60 chars</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Meta description</label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => set('seoDescription', e.target.value)}
                  placeholder={form.excerpt || 'Shown in search results…'}
                  maxLength={155}
                  rows={3}
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 resize-none placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">{(form.seoDescription || form.excerpt).length}/155 chars</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
