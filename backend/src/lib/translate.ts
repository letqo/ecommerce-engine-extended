interface ProductTranslationRow {
  locale: string
  title?: string | null
  shortDescription?: string | null
  description?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
}

interface CategoryTranslationRow {
  locale: string
  name?: string | null
  description?: string | null
}

interface StoreTranslationRow {
  locale: string
  aboutUs?: string | null
  shippingPolicy?: string | null
  returnPolicy?: string | null
  privacyPolicy?: string | null
  termsOfService?: string | null
  faqContent?: string | null
}

// Only ask Prisma for translation rows when a locale was actually requested —
// no point issuing an extra subquery that would come back empty otherwise.
export function translationsSelect(locale?: string) {
  return locale ? { translations: { where: { locale } } } : {}
}

// Overlays translated fields onto the base object, but ONLY for keys the base
// object actually has (i.e. were selected) — some routes select a narrow
// subset of fields (e.g. the store's "contact" page only selects contact
// fields), and a translation row can have other fields filled in from a
// different page; without this guard those unrelated fields would leak into
// a response that never asked for them.
function overlay<T extends Record<string, any>>(base: T, match: Record<string, any>, keys: readonly string[]): T {
  const result: Record<string, any> = { ...base }
  for (const key of keys) {
    if (key in base && match[key] != null) result[key] = match[key]
  }
  return result as T
}

// Overlays the matching locale's translation onto the base object, field by field —
// a translation row with only some fields filled in still falls back to the base
// column for the rest, rather than showing blank. Strips `translations` from the
// result so other locales' draft content never leaks into a public API response.
export function applyProductTranslation<T extends { translations?: ProductTranslationRow[] }>(
  product: T,
  locale?: string
): Omit<T, 'translations'> {
  const { translations, ...base } = product
  const match = locale ? translations?.find((t) => t.locale === locale) : undefined
  if (!match) return base

  return overlay(base, match, ['title', 'shortDescription', 'description', 'metaTitle', 'metaDescription'])
}

export function applyCategoryTranslation<T extends { translations?: CategoryTranslationRow[] }>(
  category: T,
  locale?: string
): Omit<T, 'translations'> {
  const { translations, ...base } = category
  const match = locale ? translations?.find((t) => t.locale === locale) : undefined
  if (!match) return base

  return overlay(base, match, ['name', 'description'])
}

export function applyStoreTranslation<T extends { translations?: StoreTranslationRow[] }>(
  store: T,
  locale?: string
): Omit<T, 'translations'> {
  const { translations, ...base } = store
  const match = locale ? translations?.find((t) => t.locale === locale) : undefined
  if (!match) return base

  return overlay(base, match, [
    'aboutUs', 'shippingPolicy', 'returnPolicy', 'privacyPolicy', 'termsOfService', 'faqContent',
  ])
}
