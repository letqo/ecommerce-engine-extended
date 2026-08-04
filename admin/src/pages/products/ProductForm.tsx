import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Trash2, Loader2, Wand2, Ban, Clock, Upload, FileImage } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import AIEnhancePanel, { AIEnhanceResult } from '@/components/AIEnhancePanel'
import ImageStudio from '@/components/ImageStudio'
import LocalePills, { LOCALES as LOCALE_CODES, LOCALE_LABELS, LocaleCode } from '@/components/LocalePills'

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  price: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().optional().nullable(),
  costPerItem: z.coerce.number().optional().nullable(),
  inventoryQty: z.coerce.number().int().default(0),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  sku: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  options: z.record(z.string()).default({}),
})

const schema = z.object({
  title: z.string().min(1, 'Title required'),
  shortDescription: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  categoryId: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  tags: z.string().optional(),
  videoUrl: z.string().optional().nullable(),
  deliveryMinDays: z.coerce.number().int().min(0).optional().nullable(),
  deliveryMaxDays: z.coerce.number().int().min(0).optional().nullable(),
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  isFeatured: z.boolean().default(false),
  listVariantsIndividually: z.boolean().default(false),
  // '' means "inherit the category's profile"; an explicit value overrides it.
  complianceProfile: z.string().optional().nullable(),
  complianceData: z.record(z.string()).default({}),
  images: z.array(z.object({ url: z.string().url('Invalid URL'), altText: z.string().optional().nullable(), sortOrder: z.number().default(0) })).default([]),
  variants: z.array(variantSchema).min(1, 'At least one variant required'),
  // Print-ready artwork for Gelato-sourced products. See Product.printFiles.
  printFiles: z.array(z.object({ type: z.string().min(1, 'Required'), url: z.string().url('Invalid URL') })).default([]),
  translations: z.array(z.object({
    locale: z.string(),
    title: z.string().optional().nullable(),
    shortDescription: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    metaTitle: z.string().optional().nullable(),
    metaDescription: z.string().optional().nullable(),
  })).default([]),
})

type FormData = z.infer<typeof schema>

interface ComplianceProfileDef {
  key: string
  label: string
  description: string
  fields: { key: string; label: string; help?: string; multiline?: boolean }[]
}

export default function ProductForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [categories, setCategories] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState<AIEnhanceResult | null>(null)
  const [studioImageIndex, setStudioImageIndex] = useState<number | null>(null)
  const [activeLocale, setActiveLocale] = useState<'default' | LocaleCode>('default')
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [isSupplierLinked, setIsSupplierLinked] = useState(false)
  // Which configurable supplier (if any) sources this product — set at import time, not
  // editable here (same as cjProductId/aliexpressProductId above). Only used to decide whether
  // to show the Print Files section, which only Gelato needs.
  const [productSupplierKey, setProductSupplierKey] = useState<string | null>(null)
  const [unavailableMarkets, setUnavailableMarkets] = useState<string[]>([])
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null)
  const [importedAt, setImportedAt] = useState<string | null>(null)
  const [printFileUploading, setPrintFileUploading] = useState(false)
  const [printFileError, setPrintFileError] = useState('')
  // Compliance profile registry, fetched from the backend so the field list lives in exactly
  // one place (backend/src/lib/complianceProfiles.ts) rather than being mirrored here.
  const [complianceProfiles, setComplianceProfiles] = useState<ComplianceProfileDef[]>([])

  const emptyTranslations = () => LOCALE_CODES.map((locale) => ({ locale, title: '', shortDescription: '', description: '', metaTitle: '', metaDescription: '' }))

  const { register, handleSubmit, control, reset, setValue, getValues, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'DRAFT', isFeatured: false, listVariantsIndividually: false, variants: [{ title: 'Default', price: 0, inventoryQty: 0, trackInventory: true, allowBackorder: false, isDefault: true, options: {} }], images: [], printFiles: [], translations: emptyTranslations() },
  })

  const { fields: variantFields, append: addVariant, remove: removeVariant } = useFieldArray({ control, name: 'variants' })
  const { fields: imageFields, append: addImage, remove: removeImage } = useFieldArray({ control, name: 'images' })
  const { fields: printFileFields, append: addPrintFile, remove: removePrintFile } = useFieldArray({ control, name: 'printFiles' })
  const { fields: translationFields } = useFieldArray({ control, name: 'translations' })

  // Same resolution rule the backend uses: the product's own profile wins, otherwise it
  // inherits its category's. Recomputed live so picking a category immediately reveals the
  // compliance fields that category demands.
  const selectedProfile = watch('complianceProfile')
  const selectedCategoryId = watch('categoryId')
  const inheritedProfileKey = categories.find((c) => c.id === selectedCategoryId)?.complianceProfile as string | undefined
  const effectiveProfileKey = selectedProfile || inheritedProfileKey || 'NONE'
  const resolvedProfile = complianceProfiles.find((p) => p.key === effectiveProfileKey) ?? null

  useEffect(() => {
    api.get('/api/admin/categories').then((r) => setCategories(r.data.data))
    api.get('/api/admin/compliance-profiles').then((r) => setComplianceProfiles(r.data.data)).catch(() => {})
    if (!isNew) {
      api.get(`/api/admin/products/${id}`).then((r) => {
        const p = r.data.data
        setIsSupplierLinked(!!(p.cjProductId || p.aliexpressProductId))
        setProductSupplierKey(p.supplierKey ?? null)
        setUnavailableMarkets(p.unavailableMarkets ?? [])
        setDeliveryNote(p.deliveryNote ?? null)
        setImportedAt(p.createdAt ?? null)
        const translations = emptyTranslations().map((slot) => {
          const existing = p.translations?.find((t: any) => t.locale === slot.locale)
          return existing
            ? { locale: slot.locale, title: existing.title ?? '', shortDescription: existing.shortDescription ?? '', description: existing.description ?? '', metaTitle: existing.metaTitle ?? '', metaDescription: existing.metaDescription ?? '' }
            : slot
        })
        reset({
          ...p,
          tags: p.tags?.join(', ') || '',
          categoryId: p.categoryId || '',
          complianceProfile: p.complianceProfile || '',
          // Stored as JSON; coerced to strings so every field binds to a text input.
          complianceData: Object.fromEntries(
            Object.entries(p.complianceData ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])
          ),
          variants: p.variants.map((v: any) => ({ ...v, compareAtPrice: v.compareAtPrice ?? '', costPerItem: v.costPerItem ?? '' })),
          printFiles: p.printFiles ?? [],
          translations,
        })
      })
    }
  }, [id])

  const translationIndex = (locale: LocaleCode) => translationFields.findIndex((f: any) => f.locale === locale)

  const filledLocales = new Set(
    (getValues('translations') ?? [])
      .filter((t) => t.title || t.shortDescription || t.description || t.metaTitle || t.metaDescription)
      .map((t) => t.locale)
  )

  const handleTranslate = async () => {
    if (!id || isNew || activeLocale === 'default') return
    setTranslateLoading(true)
    setTranslateError('')
    try {
      const res = await api.post('/api/admin/ai/translate-product', { productId: id, targetLocale: activeLocale })
      const idx = translationIndex(activeLocale)
      if (idx !== -1) {
        setValue(`translations.${idx}.title`, res.data.data.title, { shouldDirty: true })
        setValue(`translations.${idx}.shortDescription`, res.data.data.shortDescription, { shouldDirty: true })
        setValue(`translations.${idx}.description`, res.data.data.description, { shouldDirty: true })
        setValue(`translations.${idx}.metaTitle`, res.data.data.metaTitle, { shouldDirty: true })
        setValue(`translations.${idx}.metaDescription`, res.data.data.metaDescription, { shouldDirty: true })
      }
    } catch (e: any) {
      setTranslateError(e.response?.data?.error?.message || 'Translation failed')
    } finally {
      setTranslateLoading(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        categoryId: data.categoryId || null,
        // '' = inherit from category. Only send the keys the resolved profile actually asks
        // for, so switching profile doesn't leave the old profile's answers behind.
        complianceProfile: data.complianceProfile || null,
        complianceData: Object.fromEntries(
          (resolvedProfile?.fields ?? []).map((f) => [f.key, data.complianceData?.[f.key] ?? ''])
        ),
        translations: data.translations.filter((t) => t.title || t.shortDescription || t.description || t.metaTitle || t.metaDescription),
      }
      if (isNew) {
        await api.post('/api/admin/products', payload)
      } else {
        await api.put(`/api/admin/products/${id}`, payload)
      }
      navigate('/products')
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleEnhance = async () => {
    if (!id || isNew) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await api.post('/api/admin/ai/enhance', { productId: id })
      setAiResult(res.data.data)
    } catch (e: any) {
      setAiError(e.response?.data?.error?.message || 'AI enhancement failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplyFields = (fields: Record<string, any>) => {
    Object.entries(fields).forEach(([key, val]) => {
      setValue(key as keyof FormData, val as any, { shouldDirty: true })
    })
  }

  const handlePrintFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPrintFileUploading(true)
    setPrintFileError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post<{ success: boolean; data: { url: string } }>(
        '/api/admin/uploads/print-file', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      addPrintFile({ type: 'default', url: res.data.data.url })
    } catch (e: any) {
      setPrintFileError(e.response?.data?.error?.message || 'Upload failed')
    } finally {
      setPrintFileUploading(false)
    }
  }

  const handleApplyVariant = (variantId: string, title: string, options: Record<string, string>) => {
    const variants = getValues('variants')
    const idx = variants.findIndex((v: any) => v.id === variantId)
    if (idx !== -1) {
      setValue(`variants.${idx}.title`, title, { shouldDirty: true })
      setValue(`variants.${idx}.options`, options, { shouldDirty: true })
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /></Button>
        <h1 className="text-2xl font-bold">{isNew ? 'New product' : 'Edit product'}</h1>
        {!isNew && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
            onClick={handleEnhance}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {aiLoading ? 'Analyzing…' : 'Enhance with AI'}
          </Button>
        )}
      </div>

      {unavailableMarkets.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Didn't ship to <strong>{unavailableMarkets.join(', ')}</strong> when imported{importedAt ? ` on ${formatDate(importedAt)}` : ''}.
            This isn't rechecked automatically — availability may have changed since.
          </span>
        </div>
      )}

      {deliveryNote && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {deliveryNote}
            {importedAt ? ` (as of import on ${formatDate(importedAt)})` : ''} — not rechecked automatically.
          </span>
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {aiError && <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">{aiError}</div>}

      {aiResult && (
        <AIEnhancePanel
          result={aiResult}
          currentVariants={getValues('variants') as any}
          onApplyFields={handleApplyFields}
          onApplyVariant={handleApplyVariant}
          onClose={() => setAiResult(null)}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left column */}
          <div className="col-span-2 space-y-6">
            {/* Basic info */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <div className="pt-2">
                  <LocalePills active={activeLocale} onChange={setActiveLocale} filled={filledLocales} />
                </div>
                {activeLocale !== 'default' && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleTranslate} disabled={translateLoading || isNew}>
                      {translateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {translateLoading ? 'Translating…' : `Translate to ${LOCALE_LABELS[activeLocale]}`}
                    </Button>
                    {isNew && <p className="text-xs text-muted-foreground">Save the product first to use AI translation.</p>}
                  </div>
                )}
                {translateError && <p className="text-xs text-destructive pt-1">{translateError}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                {activeLocale === 'default' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Title *</Label>
                      <Input placeholder="Product title" {...register('title')} />
                      {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Short description</Label>
                      <Input placeholder="One-line summary shown on product cards" {...register('shortDescription')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea rows={6} placeholder="Full product description (HTML supported)" {...register('description')} />
                    </div>
                  </>
                ) : (
                  (() => {
                    const idx = translationIndex(activeLocale)
                    if (idx === -1) return null
                    return (
                      <>
                        <div className="space-y-1.5">
                          <Label>Title</Label>
                          <Input placeholder={`Falls back to default title if left blank`} {...register(`translations.${idx}.title`)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Short description</Label>
                          <Input placeholder="Falls back to default if left blank" {...register(`translations.${idx}.shortDescription`)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Description</Label>
                          <Textarea rows={6} placeholder="Falls back to default if left blank" {...register(`translations.${idx}.description`)} />
                        </div>
                      </>
                    )
                  })()
                )}
              </CardContent>
            </Card>

            {/* Variants */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Variants & Pricing</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => addVariant({ title: 'New variant', price: 0, inventoryQty: 0, trackInventory: true, allowBackorder: false, isDefault: false, options: {} })}>
                  <Plus className="w-3.5 h-3.5" /> Add variant
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {variantFields.map((field, i) => (
                  <div key={field.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Variant {i + 1}</p>
                      {variantFields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVariant(i)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input placeholder="e.g. Default, Red, Large" {...register(`variants.${i}.title`)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>SKU</Label>
                        <Input placeholder="Optional" {...register(`variants.${i}.sku`)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Price *</Label>
                        <Input type="number" step="0.01" placeholder="0.00" {...register(`variants.${i}.price`)} />
                        {errors.variants?.[i]?.price && <p className="text-xs text-destructive">{errors.variants[i]?.price?.message}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Compare at price</Label>
                        <Input type="number" step="0.01" placeholder="0.00" {...register(`variants.${i}.compareAtPrice`)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cost per item</Label>
                        <Input type="number" step="0.01" placeholder="0.00" {...register(`variants.${i}.costPerItem`)} />
                        {isSupplierLinked && (
                          <p className="text-xs text-muted-foreground">Includes estimated supplier shipping, not just item cost.</p>
                        )}
                      </div>
                      <div className="space-y-1.5 col-span-2 flex items-center gap-2">
                        <input type="checkbox" id={`track-${i}`} {...register(`variants.${i}.trackInventory`)} className="rounded" />
                        <Label htmlFor={`track-${i}`}>Track inventory for this variant</Label>
                      </div>
                      {watch(`variants.${i}.trackInventory`) ? (
                        <>
                          <div className="space-y-1.5">
                            <Label>Inventory qty</Label>
                            <Input type="number" placeholder="0" {...register(`variants.${i}.inventoryQty`)} />
                          </div>
                          <div className="space-y-1.5 flex items-end gap-2 pb-2">
                            <input type="checkbox" id={`backorder-${i}`} {...register(`variants.${i}.allowBackorder`)} className="rounded" />
                            <Label htmlFor={`backorder-${i}`}>Allow purchase when out of stock</Label>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground col-span-2">
                          No stock count is shown. Always purchasable — use this for made-to-order or drop-shipped items with no held inventory.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Images */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Images</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => addImage({ url: '', sortOrder: imageFields.length })}>
                  <Plus className="w-3.5 h-3.5" /> Add image URL
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {imageFields.length === 0 && <p className="text-sm text-muted-foreground">No images yet. Add a URL or import from a supplier.</p>}

                {/* Thumbnail grid */}
                {imageFields.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {imageFields.map((field, i) => {
                      const url = getValues(`images.${i}.url`)
                      return (
                        <div key={field.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-gray-50">
                          {url ? (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No URL</div>
                          )}
                          {/* Overlay buttons */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            {url && (
                              <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => setStudioImageIndex(i)} title="Open Image Studio">
                                <Wand2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(i)} title="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          {i === 0 && <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">Main</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* URL inputs (collapsed, for adding/editing) */}
                {imageFields.map((field, i) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input placeholder="https://..." {...register(`images.${i}.url`)} className="text-xs h-8" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Print files — only Gelato needs artwork attached to place an order. Product must
                already be linked to Gelato via import (supplierKey isn't editable here). */}
            {productSupplierKey === 'GELATO' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Print files</CardTitle>
                    <p className="text-xs text-muted-foreground pt-1">
                      Required by Gelato before an order for this product can be submitted — see its product page on
                      Gelato's dashboard for which print areas it needs (e.g. "default", "front", "back").
                    </p>
                  </div>
                  <label>
                    <input type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" className="hidden" onChange={handlePrintFileUpload} disabled={printFileUploading} />
                    <span className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium cursor-pointer ${printFileUploading ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'}`}>
                      {printFileUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {printFileUploading ? 'Uploading…' : 'Upload file'}
                    </span>
                  </label>
                </CardHeader>
                <CardContent className="space-y-3">
                  {printFileError && <p className="text-xs text-destructive">{printFileError}</p>}
                  {printFileFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">No print files yet — Gelato will reject orders for this product until one is added.</p>
                  )}
                  {printFileFields.map((field, i) => (
                    <div key={field.id} className="flex items-center gap-2 border rounded-lg p-2.5">
                      <FileImage className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input placeholder="Print area (e.g. default, front, back)" {...register(`printFiles.${i}.type`)} className="text-xs h-8 w-48" />
                      <Input placeholder="File URL" {...register(`printFiles.${i}.url`)} className="text-xs h-8 flex-1" readOnly />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removePrintFile(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Image Studio modal */}
            {studioImageIndex !== null && getValues(`images.${studioImageIndex}.url`) && (
              <ImageStudio
                imageUrl={getValues(`images.${studioImageIndex}.url`)}
                onSave={(newUrl) => {
                  addImage({ url: newUrl, sortOrder: imageFields.length })
                  setStudioImageIndex(null)
                }}
                onClose={() => setStudioImageIndex(null)}
              />
            )}

            {/* SEO */}
            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
                <p className="text-xs text-muted-foreground pt-1">Editing: {activeLocale === 'default' ? 'Default' : LOCALE_LABELS[activeLocale]} (switch language above in Details)</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeLocale === 'default' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Meta title</Label>
                      <Input placeholder="Leave blank to use product title" {...register('metaTitle')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Meta description</Label>
                      <Textarea rows={2} placeholder="Leave blank to use short description" {...register('metaDescription')} />
                    </div>
                  </>
                ) : (
                  (() => {
                    const idx = translationIndex(activeLocale)
                    if (idx === -1) return null
                    return (
                      <>
                        <div className="space-y-1.5">
                          <Label>Meta title</Label>
                          <Input placeholder="Falls back to default if left blank" {...register(`translations.${idx}.metaTitle`)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Meta description</Label>
                          <Textarea rows={2} placeholder="Falls back to default if left blank" {...register(`translations.${idx}.metaDescription`)} />
                        </div>
                      </>
                    )
                  })()
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Video</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label>Video URL</Label>
                  <Input placeholder="https://… (auto-filled from supplier)" {...register('videoUrl')} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Delivery estimate</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Min days</Label>
                    <Input type="number" min="0" placeholder="e.g. 7" {...register('deliveryMinDays')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max days</Label>
                    <Input type="number" min="0" placeholder="e.g. 15" {...register('deliveryMaxDays')} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Auto-filled from supplier. Override here if needed.</p>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Status</CardTitle></CardHeader>
              <CardContent>
                <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...register('status')}>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...register('categoryId')}>
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Vendor</Label>
                  <Input placeholder="Brand or supplier" {...register('vendor')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <Input placeholder="comma, separated, tags" {...register('tags')} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="featured" {...register('isFeatured')} className="rounded" />
                  <Label htmlFor="featured">Featured product</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="listVariantsIndividually" {...register('listVariantsIndividually')} className="rounded" />
                  <Label htmlFor="listVariantsIndividually">List each variant as a separate product</Label>
                </div>
              </CardContent>
            </Card>

            {/* Compliance. Fields are rendered from the backend registry — nothing about any
                specific profile is hardcoded here, so a new profile appears automatically. */}
            <Card>
              <CardHeader><CardTitle>Compliance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Profile</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    {...register('complianceProfile')}
                  >
                    <option value="">
                      {inheritedProfileKey && inheritedProfileKey !== 'NONE'
                        ? `Inherit from category (${complianceProfiles.find((p) => p.key === inheritedProfileKey)?.label ?? inheritedProfileKey})`
                        : 'Inherit from category (none)'}
                    </option>
                    <option value="NONE">None — no disclosures required</option>
                    {complianceProfiles.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {resolvedProfile ? (
                  <>
                    <p className="text-xs text-muted-foreground">{resolvedProfile.description}</p>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                      All of these are required before this product can be set Active.
                    </p>
                    {resolvedProfile.fields.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label>{f.label}</Label>
                        {f.multiline ? (
                          <Textarea rows={3} {...register(`complianceData.${f.key}` as const)} />
                        ) : (
                          <Input {...register(`complianceData.${f.key}` as const)} />
                        )}
                        {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No compliance disclosures are required for this product. Assign a profile here, or set one on its
                    category to apply it to every product in that category.
                  </p>
                )}
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save product'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
