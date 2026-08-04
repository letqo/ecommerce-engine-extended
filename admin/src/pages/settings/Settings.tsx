import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Check, Globe, Sparkles, Upload, Wand2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import LocalePills, { LOCALES as LOCALE_CODES, LOCALE_LABELS, LocaleCode } from '@/components/LocalePills'
import { useStoreContext } from '@/stores/storeContext'

const SOURCING_COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'IT', label: 'Italy' },
  { code: 'ES', label: 'Spain' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'SE', label: 'Sweden' },
  { code: 'PL', label: 'Poland' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'SG', label: 'Singapore' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'IN', label: 'India' },
  { code: 'ZA', label: 'South Africa' },
]

const SOURCING_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'SEK', label: 'SEK — Swedish Krona' },
  { code: 'PLN', label: 'PLN — Polish Zloty' },
  { code: 'BRL', label: 'BRL — Brazilian Real' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
]

function currencySymbolFor(code: string): string {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')
    return part?.value ?? code
  } catch {
    return code
  }
}

type GeneratableField = 'aboutUs' | 'shippingPolicy' | 'returnPolicy' | 'privacyPolicy' | 'termsOfService' | 'faqContent'

const TRANSLATABLE_FIELDS: GeneratableField[] = ['aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent']

const emptyStoreTranslations = () =>
  LOCALE_CODES.map((locale) => ({
    locale,
    aboutUs: '', shippingPolicy: '', returnPolicy: '', privacyPolicy: '', termsOfService: '', faqContent: '',
  }))

function AIGenerateButton({ field, generating, onClick }: {
  field: GeneratableField
  generating: GeneratableField | null
  onClick: (field: GeneratableField) => void
}) {
  const isThis = generating === field
  const busy = generating !== null
  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isThis
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
        : <><Sparkles className="w-3 h-3" /> AI Generate</>
      }
    </button>
  )
}

function ImageUploadField({ label, hint, value, folder, shape, onChange }: {
  label: string
  hint?: string
  value?: string
  folder: string
  shape: 'square' | 'wide'
  onChange: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post<{ success: boolean; data: { url: string } }>(
        `/api/admin/uploads/image?folder=${folder}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      onChange(res.data.data.url)
    } catch { alert('Image upload failed') }
    finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt={label}
            className={shape === 'square' ? 'w-12 h-12 object-contain rounded border border-gray-200 bg-white' : 'h-10 max-w-[160px] object-contain rounded border border-gray-200 bg-white px-2'}
          />
        ) : (
          <div className={shape === 'square' ? 'w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-muted-foreground' : 'h-10 w-24 rounded border border-dashed border-gray-300 flex items-center justify-center text-muted-foreground'}>
            <Upload size={16} />
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</> : value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-red-500">
            Remove
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={upload} />
    </div>
  )
}

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [generating, setGenerating] = useState<GeneratableField | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [activeLocale, setActiveLocale] = useState<'default' | LocaleCode>('default')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  const { register, reset, handleSubmit, setValue, watch } = useForm()
  const { refreshStores } = useStoreContext()
  const logoUrl = watch('logoUrl')
  const faviconUrl = watch('faviconUrl')
  const targetMarkets: string[] = watch('targetMarkets') ?? []
  const heroBannerUrls: string[] = watch('heroBannerUrls') ?? []

  const toggleTargetMarket = (code: string) => {
    const next = targetMarkets.includes(code)
      ? targetMarkets.filter((c) => c !== code)
      : [...targetMarkets, code]
    setValue('targetMarkets', next, { shouldDirty: true })
  }

  const addHeroBannerUrl = () => setValue('heroBannerUrls', [...heroBannerUrls, ''], { shouldDirty: true })
  const removeHeroBannerUrl = (i: number) => setValue('heroBannerUrls', heroBannerUrls.filter((_, idx) => idx !== i), { shouldDirty: true })
  const updateHeroBannerUrl = (i: number, url: string) =>
    setValue('heroBannerUrls', heroBannerUrls.map((u, idx) => (idx === i ? url : u)), { shouldDirty: true })

  const generateField = async (field: GeneratableField) => {
    setGenerating(field)
    setGenerateError(null)
    try {
      const res = await api.post('/api/admin/ai/store-content', { field })
      if (res.data.success) {
        setValue(field, res.data.data, { shouldDirty: true })
      }
    } catch (err: any) {
      setGenerateError(err?.response?.data?.error?.message ?? 'AI generation failed')
    } finally {
      setGenerating(null)
    }
  }

  const translateAll = async () => {
    if (activeLocale === 'default') return
    setTranslating(true)
    setTranslateError(null)
    try {
      const res = await api.post('/api/admin/ai/translate-store-content', { targetLocale: activeLocale })
      const idx = LOCALE_CODES.indexOf(activeLocale)
      for (const [field, value] of Object.entries(res.data.data)) {
        setValue(`translations.${idx}.${field}`, value, { shouldDirty: true })
      }
    } catch (err: any) {
      setTranslateError(err?.response?.data?.error?.message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  useEffect(() => {
    api.get('/api/admin/store').then((r) => {
      const s = r.data.data
      if (s) {
        const translations = emptyStoreTranslations().map((slot) => {
          const existing = s.translations?.find((t: any) => t.locale === slot.locale)
          return existing ? { ...slot, ...existing } : slot
        })
        reset({ ...s, translations })
      }
      setLoading(false)
    }).catch((err: any) => {
      setLoadError(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to load store settings')
      setLoading(false)
    })
  }, [])

  const onSubmit = async (data: any) => {
    setSaving(true)
    setSaved(false)
    const translations = (data.translations ?? []).filter((t: any) =>
      TRANSLATABLE_FIELDS.some((f) => t[f]?.trim())
    )
    await api.put('/api/admin/store', { ...data, translations })
    // Sidebar's store switcher caches name/currency/shipToCountry from login — refresh it
    // so a settings change (e.g. currency, ship-to country) shows up without a full reload.
    await refreshStores()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const translationIndex = activeLocale !== 'default' ? LOCALE_CODES.indexOf(activeLocale) : -1

  if (loading) return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Skeleton className="h-8 w-40" />
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}
    </div>
  )

  if (loadError) return (
    <div className="p-6 max-w-3xl">
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        Couldn't load store settings: {loadError}
      </p>
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Button onClick={handleSubmit(onSubmit)} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : saved ? <><Check className="w-4 h-4" /> Saved!</>
            : 'Save changes'}
        </Button>
      </div>

      <form className="space-y-6">
        {/* General */}
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Store name</Label>
                <Input placeholder="Precisie" {...register('name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input type="email" placeholder="hello@precisie.eu" {...register('contactEmail')} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact phone</Label>
                <Input placeholder="+1 (555) 000-0000" {...register('contactPhone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  {...register('currency')}
                  onChange={(e) => {
                    setValue('currency', e.target.value, { shouldDirty: true })
                    setValue('currencySymbol', currencySymbolFor(e.target.value), { shouldDirty: true })
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SOURCING_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">The currency customers are charged in — used everywhere prices are shown or charged.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shipToCountry">Ship-to country</Label>
                <select
                  id="shipToCountry"
                  {...register('shipToCountry')}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SOURCING_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">The country you primarily ship to — used to look up accurate prices, stock, and delivery times from CJ and AliExpress. Not where products are sourced from.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Target markets</Label>
              <div className="flex flex-wrap gap-2">
                {SOURCING_COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleTargetMarket(c.code)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      targetMarkets.includes(c.code)
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Countries you plan to sell to. Used to show shipping coverage when importing products — doesn't affect who can check out.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Store description</Label>
              <Textarea rows={3} placeholder="What your store is about" {...register('description')} />
            </div>
          </CardContent>
        </Card>

        {/* Transactional email */}
        <Card>
          <CardHeader>
            <CardTitle>Transactional email</CardTitle>
            <CardDescription>
              Controls the "From" name and address on order confirmations, shipping updates, and other automated emails for this store.
              Leave blank to use the account-wide default — but if you run more than one store, each one should have its own so customers
              don't see another store's name in their inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>From name</Label>
                <Input placeholder="e.g. Your Store Name" {...register('emailFromName')} />
              </div>
              <div className="space-y-1.5">
                <Label>From address</Label>
                <Input type="email" placeholder="orders@yourdomain.com" {...register('emailFromAddress')} />
                <p className="text-xs text-muted-foreground">Must be on a domain verified with your email provider (Resend), or emails will fail to send.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              The favicon is the small icon shown in the browser tab. Square images work best (e.g. 512×512 PNG).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <ImageUploadField
              label="Logo"
              hint="Shown in the storefront header."
              value={logoUrl}
              folder="branding"
              shape="wide"
              onChange={(url) => setValue('logoUrl', url, { shouldDirty: true })}
            />
            <ImageUploadField
              label="Favicon"
              hint="Shown in the browser tab."
              value={faviconUrl}
              folder="branding"
              shape="square"
              onChange={(url) => setValue('faviconUrl', url, { shouldDirty: true })}
            />
          </CardContent>
        </Card>

        {/* Announcement banner */}
        <Card>
          <CardHeader><CardTitle>Announcement banner</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="announcementActive" {...register('announcementActive')} className="rounded" />
              <Label htmlFor="announcementActive">Show announcement banner</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Input placeholder="Free shipping on orders over $50" {...register('announcementText')} />
            </div>
            <div className="space-y-1.5">
              <Label>Link (optional)</Label>
              <Input placeholder="/products" {...register('announcementLink')} />
            </div>
          </CardContent>
        </Card>

        {/* Homepage hero */}
        <Card>
          <CardHeader><CardTitle>Homepage hero</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Headline</Label>
              <Input placeholder="Discover products you'll love" {...register('heroHeadline')} />
            </div>
            <div className="space-y-1.5">
              <Label>Subtext</Label>
              <Input placeholder="Free shipping over $50" {...register('heroSubtext')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Button text</Label>
                <Input placeholder="Shop now" {...register('heroCtaText')} />
              </div>
              <div className="space-y-1.5">
                <Label>Button link</Label>
                <Input placeholder="/products" {...register('heroCtaLink')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Banner image URL</Label>
              <Input placeholder="https://..." {...register('heroBannerUrl')} />
              <p className="text-xs text-muted-foreground">Used for hero layouts that fill the whole banner with one image.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Carousel images (Showcase layout)</Label>
              <p className="text-xs text-muted-foreground mb-1">For the two-column "Showcase" hero — cycles through these automatically. Leave empty to fall back to the single banner image above.</p>
              {heroBannerUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => updateHeroBannerUrl(i, e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => removeHeroBannerUrl(i)}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addHeroBannerUrl}>Add image</Button>
            </div>
          </CardContent>
        </Card>

        {/* SEO */}
        <Card>
          <CardHeader><CardTitle>SEO</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Meta title</Label>
              <Input placeholder="Precisie — Free Shipping on Orders $50+" {...register('metaTitle')} />
            </div>
            <div className="space-y-1.5">
              <Label>Meta description</Label>
              <Textarea rows={2} placeholder="Shop our collection of…" {...register('metaDescription')} />
            </div>
          </CardContent>
        </Card>

        {/* AliExpress sourcing currency */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <div>
                <CardTitle>AliExpress sourcing currency</CardTitle>
                <CardDescription className="mt-0.5">
                  The currency AliExpress reports product costs in when you import products — independent of your store's selling currency above. CJ is unaffected by this setting.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sourcingCurrency">Sourcing currency</Label>
              <select
                id="sourcingCurrency"
                {...register('sourcingCurrency')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SOURCING_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defaultImportMarkup">Default import markup</Label>
              <Input
                id="defaultImportMarkup"
                type="number"
                step="0.05"
                min="1"
                {...register('defaultImportMarkup', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Starting price multiplier when importing a product (e.g. 2.5 = sell at 2.5x landed cost). You can still override it per import.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Language switcher for About/Policies/FAQ content */}
        <Card>
          <CardHeader>
            <CardTitle>Content language</CardTitle>
            <CardDescription>
              About Us, FAQ, and the 4 policy pages below can be translated per language. "Default" is the original
              text shown to any language without its own translation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <LocalePills active={activeLocale} onChange={setActiveLocale} filled={new Set()} />
            {activeLocale !== 'default' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={translateAll}
                  disabled={translating}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-violet-300 text-violet-700 rounded-lg text-sm hover:bg-violet-50 transition-colors disabled:opacity-50"
                >
                  {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {translating ? 'Translating…' : `Translate all to ${LOCALE_LABELS[activeLocale]}`}
                </button>
              </div>
            )}
            {translateError && <p className="text-xs text-red-500">{translateError}</p>}
          </CardContent>
        </Card>

        {/* About & Contact */}
        <Card>
          <CardHeader>
            <CardTitle>About & Contact</CardTitle>
            {generateError && <p className="text-xs text-red-500 mt-1">{generateError}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>About us{activeLocale !== 'default' && ` (${LOCALE_LABELS[activeLocale]})`}</Label>
                {activeLocale === 'default' && <AIGenerateButton field="aboutUs" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={5} placeholder="Tell your story — who you are, what you sell, why customers should trust you…" {...register('aboutUs')} />
              ) : (
                <Textarea rows={5} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.aboutUs`)} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea rows={2} placeholder="123 Main St, New York, NY 10001" {...register('address')} />
            </div>
          </CardContent>
        </Card>

        {/* Policies */}
        <Card>
          <CardHeader><CardTitle>Policies{activeLocale !== 'default' && ` (${LOCALE_LABELS[activeLocale]})`}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Shipping policy</Label>
                {activeLocale === 'default' && <AIGenerateButton field="shippingPolicy" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={4} placeholder="Orders ship within 1-2 business days…" {...register('shippingPolicy')} />
              ) : (
                <Textarea rows={4} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.shippingPolicy`)} />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Return policy</Label>
                {activeLocale === 'default' && <AIGenerateButton field="returnPolicy" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={4} placeholder="We accept returns within 30 days…" {...register('returnPolicy')} />
              ) : (
                <Textarea rows={4} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.returnPolicy`)} />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Privacy policy</Label>
                {activeLocale === 'default' && <AIGenerateButton field="privacyPolicy" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={4} placeholder="We collect and use your personal data to…" {...register('privacyPolicy')} />
              ) : (
                <Textarea rows={4} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.privacyPolicy`)} />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Terms of service</Label>
                {activeLocale === 'default' && <AIGenerateButton field="termsOfService" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={4} placeholder="By using our website, you agree to…" {...register('termsOfService')} />
              ) : (
                <Textarea rows={4} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.termsOfService`)} />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>FAQ</Label>
                {activeLocale === 'default' && <AIGenerateButton field="faqContent" generating={generating} onClick={generateField} />}
              </div>
              {activeLocale === 'default' ? (
                <Textarea rows={4} placeholder="Q: How long does shipping take?\nA: 7-14 business days…" {...register('faqContent')} />
              ) : (
                <Textarea rows={4} placeholder="Falls back to the default text if left blank" {...register(`translations.${translationIndex}.faqContent`)} />
              )}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
