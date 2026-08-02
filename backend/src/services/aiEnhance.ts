import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { Locale } from '../lib/locales'

export type StoreContentField = 'aboutUs' | 'shippingPolicy' | 'returnPolicy' | 'privacyPolicy' | 'termsOfService' | 'faqContent'

const FIELD_PROMPTS: Record<StoreContentField, string> = {
  aboutUs: `Write a warm, trustworthy "About Us" page for this online store. Use plain text, no HTML. Mention the store name, what it sells, and why customers can trust it. 200–300 words.`,
  shippingPolicy: `Write a clear, professional shipping policy for a dropshipping online store. Cover: order processing (1–3 business days), standard international shipping (7–15 business days), order tracking, no liability for customs delays. Plain text, no HTML. 150–250 words.`,
  returnPolicy: `Write a fair, customer-friendly return/damage policy for a dropshipping store. Cover: if an item arrives damaged, defective, or with parts missing, the customer reports it within 14 days of delivery via the "Report a problem" link on the order tracking page, with photos; no physical return is needed — the customer keeps or disposes of the item; the report is reviewed (often automatically, sometimes by a person) and resolved with a refund or replacement, typically within a couple of business days. Plain text, no HTML. 150–200 words.`,
  privacyPolicy: `Write a GDPR-compliant privacy policy for an e-commerce store. Cover: data collected (name, email, address, payment info), purpose (order fulfillment, marketing with consent), third parties (payment processor, shipping carriers), retention period, customer rights (access, correction, deletion), contact for privacy queries. Use plain text with section headers. 300–400 words.`,
  termsOfService: `Write professional Terms of Service for an e-commerce store. Cover: acceptance of terms, product pricing, order cancellation, limitation of liability, governing law, contact information. Plain text with section headers. 250–350 words.`,
  faqContent: `Write a helpful FAQ section for a dropshipping online store. Include 8–10 questions covering shipping time, tracking, returns, payment methods, customs/duties, order changes, and contacting support. Format each as:\nQ: ...\nA: ...\n`,
}

export async function generateStoreContent(
  field: StoreContentField,
  storeContext: { name: string; description?: string; contactEmail?: string; currency?: string }
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const context = [
    `Store name: ${storeContext.name}`,
    `Currency: ${storeContext.currency ?? 'USD'}`,
    storeContext.contactEmail ? `Contact email: ${storeContext.contactEmail}` : null,
    storeContext.description ? `Store description: ${storeContext.description}` : null,
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: `${FIELD_PROMPTS[field]}\n\nStore context:\n${context}\n\nReturn ONLY the text content, no JSON, no extra commentary.` }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return text.trim()
}

export interface BlogDraftResult {
  title: string
  content: string
  excerpt: string
  seoTitle: string
  seoDescription: string
  tags: string[]
}

export async function generateBlogDraft(
  topic: string,
  storeContext: { name: string; description?: string }
): Promise<BlogDraftResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const prompt = `You are a content writer for an e-commerce store's blog. Write a full blog post draft.

Store name: ${storeContext.name}
${storeContext.description ? `Store description: ${storeContext.description}` : ''}
Topic/brief from the store owner: ${topic}

Instructions:
1. Write an engaging, SEO-friendly title.
2. Write the full post body in HTML. Use <h2>/<h3> for section headings, <p> for paragraphs, <ul>/<li> for lists, <strong> for emphasis. NO <img> tags — images are added separately. 500-900 words, well-structured with multiple sections.
3. Write a one-sentence excerpt for blog listing pages (max 160 chars).
4. Write an SEO meta title (max 60 chars).
5. Write an SEO meta description (max 155 chars).
6. Generate 3-6 relevant lowercase tags.

Return ONLY a valid JSON object, no other text:
{
  "title": "string",
  "content": "HTML string",
  "excerpt": "string",
  "seoTitle": "string",
  "seoDescription": "string",
  "tags": ["string"]
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unexpected format. Check backend logs.')

  return JSON.parse(match[0]) as BlogDraftResult
}

export interface AIEnhanceInput {
  title: string
  description?: string | null
  shortDescription?: string | null
  vendor?: string | null
  variants: { id: string; title: string; options: Record<string, string> }[]
}

export interface AIEnhanceResult {
  description: string
  shortDescription: string
  vendor: string
  metaTitle: string
  metaDescription: string
  tags: string[]
  variantRenames: { variantId: string; title: string; options: Record<string, string> }[]
  missingInfo: string[]
}

export async function enhanceProduct(input: AIEnhanceInput): Promise<AIEnhanceResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const variantLines = input.variants
    .map((v, i) => `${i + 1}. id="${v.id}" | current title: "${v.title}" | options: ${JSON.stringify(v.options)}`)
    .join('\n')

  const prompt = `You are a product content specialist for an e-commerce dropshipping store. Analyze this supplier product and return enhanced content.

Product title: ${input.title}
Current vendor/brand: ${input.vendor ?? 'unknown'}

Raw description (may contain HTML, embedded images, supplier marketing text, Chinese characters):
${input.description ?? '(none)'}

Current short description: ${input.shortDescription ?? '(none)'}

Variants:
${variantLines}

Instructions:
1. Write a clean, professional product description in HTML. Use only <p>, <ul>, <li>, <strong>, <h3> tags. NO <img> tags. NO excessive exclamation marks. Focus on benefits and features. Max 400 words.
2. Write a short one-line summary for product cards (max 120 chars).
3. Extract the brand/vendor name from the title or description. If none found, return "Generic".
4. Write an SEO meta title (max 60 chars, include main keyword).
5. Write an SEO meta description (max 160 chars).
6. Generate 3-6 relevant lowercase tags.
7. For each variant: suggest a better human-readable title and proper option key-value pairs. Fix abbreviations (e.g. "Airpods1or2" → "AirPods 1/2", "XL" stays "XL", "OrangeBlack" → "Orange Black"). Use proper option keys: Color, Size, Style, Material, Compatibility, etc.
8. List up to 5 important details customers need that are missing from the description (e.g. "Size chart", "Material composition", "Dimensions", "Compatibility list").

Return ONLY a valid JSON object, no other text:
{
  "description": "HTML string",
  "shortDescription": "string",
  "vendor": "string",
  "metaTitle": "string",
  "metaDescription": "string",
  "tags": ["string"],
  "variantRenames": [
    { "variantId": "exact-id-from-input", "title": "Display Title", "options": { "Key": "Value" } }
  ],
  "missingInfo": ["string"]
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unexpected format. Check backend logs.')

  return JSON.parse(match[0]) as AIEnhanceResult
}

const LOCALE_INFO: Record<Locale, { name: string; note: string }> = {
  en: { name: 'English', note: 'Clear, direct e-commerce copy.' },
  fr: { name: 'French', note: 'Use the formal "vous" register, as is standard for French e-commerce.' },
  de: { name: 'German', note: 'Direct and precise, as German shoppers expect — avoid overly flowery language.' },
  it: { name: 'Italian', note: 'Warm and expressive, but still professional — typical of Italian retail copy.' },
  es: { name: 'Spanish', note: 'Clear and friendly, standard neutral Spanish suitable across Spain and Latin America.' },
}

export interface ProductTranslationInput {
  title: string
  shortDescription?: string | null
  description?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
}

export interface ProductTranslationResult {
  title: string
  shortDescription: string
  description: string
  metaTitle: string
  metaDescription: string
}

export async function translateProductContent(
  input: ProductTranslationInput,
  targetLocale: Locale
): Promise<ProductTranslationResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const info = LOCALE_INFO[targetLocale]

  const prompt = `You are a native ${info.name} e-commerce copywriter localizing a product listing for the ${info.name} market. ${info.note}

Do NOT translate literally, word-for-word. Rewrite each field the way a native ${info.name} copywriter would naturally phrase it for an online store, preserving the original meaning and any factual details (materials, sizes, specifications), but adapting tone, idiom, and sentence structure so it reads as if it was originally written in ${info.name}.

Source content (English or another base language):
Title: ${input.title}
Short description: ${input.shortDescription ?? '(none)'}
Description: ${input.description ?? '(none)'}
Meta title (SEO, max 60 chars): ${input.metaTitle ?? '(none)'}
Meta description (SEO, max 160 chars): ${input.metaDescription ?? '(none)'}

Return ONLY a valid JSON object, no other text:
{
  "title": "translated title",
  "shortDescription": "translated short description",
  "description": "translated description, same HTML tags as the source if any",
  "metaTitle": "translated SEO meta title, max 60 chars",
  "metaDescription": "translated SEO meta description, max 160 chars"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unexpected format. Check backend logs.')

  return JSON.parse(match[0]) as ProductTranslationResult
}

export interface CategoryTranslationInput {
  name: string
  description?: string | null
}

export interface CategoryTranslationResult {
  name: string
  description: string
}

export async function translateCategoryContent(
  input: CategoryTranslationInput,
  targetLocale: Locale
): Promise<CategoryTranslationResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const info = LOCALE_INFO[targetLocale]

  const prompt = `You are a native ${info.name} e-commerce copywriter localizing a product category label for the ${info.name} market. ${info.note}

Do NOT translate literally, word-for-word. Rewrite naturally, the way a native ${info.name} online store would phrase it.

Source content:
Name: ${input.name}
Description: ${input.description ?? '(none)'}

Return ONLY a valid JSON object, no other text:
{
  "name": "translated category name",
  "description": "translated description"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unexpected format. Check backend logs.')

  return JSON.parse(match[0]) as CategoryTranslationResult
}

const STORE_CONTENT_LABELS: Record<string, string> = {
  aboutUs: 'About Us page',
  shippingPolicy: 'Shipping Policy',
  returnPolicy: 'Return Policy',
  privacyPolicy: 'Privacy Policy',
  termsOfService: 'Terms of Service',
  faqContent: 'FAQ section',
}

// One combined call for whatever fields are non-empty, not one call per field —
// cheaper, and gives the model full-page context so tone stays consistent
// across About Us/FAQ/policies rather than translating each field blind.
export async function translateStoreContent(
  fields: Record<string, string>,
  targetLocale: Locale
): Promise<Record<string, string>> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const info = LOCALE_INFO[targetLocale]

  const entries = Object.entries(fields).filter(([, v]) => v && v.trim())
  if (entries.length === 0) return {}

  const sections = entries
    .map(([key, value]) => `### ${STORE_CONTENT_LABELS[key] ?? key} (id: "${key}")\n${value}`)
    .join('\n\n')

  const prompt = `You are a native ${info.name} copywriter localizing an online store's policy and information pages for the ${info.name} market. ${info.note}

Do NOT translate literally, word-for-word. Rewrite each page naturally, the way a native ${info.name} e-commerce store would phrase it, preserving all factual details (timeframes, contact info, legal terms) exactly.

${sections}

Return ONLY a valid JSON object mapping each id to its ${info.name} translation, no other text:
{ ${entries.map(([key]) => `"${key}": "translated text"`).join(', ')} }`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`AI response was truncated or malformed (stop_reason: ${message.stop_reason}). Try translating fewer fields at once.`)

  const parsed = JSON.parse(match[0])
  const result: Record<string, string> = {}
  for (const [key] of entries) {
    if (typeof parsed[key] === 'string') result[key] = parsed[key]
  }
  return result
}

// Translates a flat list of short theme UI strings (nav labels, section
// headings, testimonial quotes, etc.) — deliberately NOT a whole-JSON-blob
// translation. Asking a model to translate a short list of strings by id is
// far lower-risk than asking it to reproduce a large nested document exactly
// except for certain leaf values.
export async function translateThemeStrings(
  entries: { path: string; source: string }[],
  targetLocale: Locale
): Promise<Record<string, string>> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const info = LOCALE_INFO[targetLocale]

  if (entries.length === 0) return {}

  const list = entries.map((e) => `"${e.path}": ${JSON.stringify(e.source)}`).join('\n')

  const prompt = `You are a native ${info.name} e-commerce copywriter localizing short UI text snippets (navigation labels, section headings, testimonials, FAQ entries, buttons, etc.) from an online store's theme for the ${info.name} market. ${info.note}

Do NOT translate literally, word-for-word. Rewrite each snippet the way a native ${info.name} copywriter would naturally phrase it, preserving meaning.

Below is a list of snippets, each with an id. Translate each one's text into ${info.name}:

${list}

Return ONLY a valid JSON object mapping each id to its ${info.name} translation, no other text:
{ "id1": "translation1", "id2": "translation2" }`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unexpected format. Check backend logs.')

  const parsed = JSON.parse(match[0])
  const validPaths = new Set(entries.map((e) => e.path))
  const result: Record<string, string> = {}
  for (const [path, value] of Object.entries(parsed)) {
    if (validPaths.has(path) && typeof value === 'string') result[path] = value
  }
  return result
}
