import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { Prisma } from '@prisma/client'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { isLocale } from '../../lib/locales'
import { describeThemeTranslations, ThemeTranslationMap } from '../../lib/themeText'

const router = Router()
router.use(requireAdmin)

const REQUIRED_VARS = [
  '--primary', '--primary-hover', '--primary-text', '--accent',
  '--hero-bg', '--hero-text', '--hero-sub',
  '--footer-bg', '--footer-text',
  '--font-sans', '--radius-btn', '--radius-card',
]

const homeSectionSchema = z.object({
  type: z.enum([
    'hero', 'featured-products', 'newsletter', 'brand-statement',
    'categories', 'testimonials', 'trust-badges', 'promo-banner',
    'image-with-text', 'brand-logos', 'new-arrivals', 'best-sellers',
    'countdown', 'faq', 'video', 'blog-posts', 'icon-row',
  ]),
  variant: z.string().max(30).optional(),
  eyebrow: z.string().max(100).optional(),
  heading: z.string().max(200).optional(),
  text: z.string().max(1000).optional(),
  cta: z.object({ label: z.string().max(50), href: z.string().max(200) }).optional(),
  imageUrl: z.string().max(500).optional(),
  imagePosition: z.enum(['left', 'right']).optional(),
  videoUrl: z.string().max(500).optional(),
  targetDate: z.string().max(30).optional(),
  items: z.array(z.record(z.unknown())).max(20).optional(),
})

const navItemSchema = z.object({
  label: z.string().max(50),
  href: z.string().max(200),
  children: z.array(z.object({ label: z.string().max(50), href: z.string().max(200) })).max(15).optional(),
})

const sectionsSchema = z.object({
  header: z.object({
    variant: z.enum(['default', 'centered', 'overlay', 'two-tier']),
    navItems: z.array(navItemSchema).max(10).optional(),
  }).optional(),
  footer: z.object({ variant: z.enum(['default', 'minimal', 'newsletter', 'mega']) }).optional(),
  home: z.array(homeSectionSchema).max(10).optional(),
  productsGrid: z.enum(['grid-4', 'grid-3', 'grid-2']).optional(),
  productDetail: z.enum(['side-by-side', 'stacked', 'gallery-sticky', 'spec-sheet']).optional(),
  productCard: z.enum(['default', 'overlay', 'detailed', 'plate']).optional(),
  cartLayout: z.enum(['sidebar', 'bottom-bar']).optional(),
  checkoutLayout: z.enum(['two-column', 'single-column']).optional(),
  announcementBar: z.object({
    messages: z.array(z.string().max(200)).max(5),
    speed: z.number().optional(),
    variant: z.enum(['marquee', 'utility']).optional(),
    showClock: z.boolean().optional(),
  }).optional(),
}).optional()

export const themeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  vars: z.record(z.string()).refine(
    (v) => REQUIRED_VARS.every((k) => k in v),
    { message: `vars must include all required keys: ${REQUIRED_VARS.join(', ')}` }
  ),
  css: z.string().max(51200).optional(),
  sections: sectionsSchema,
})

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
}

function sanitizeCss(css: string): string {
  return css
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/expression\s*\(/gi, '')
}

export async function getStoreId(req: AdminRequest): Promise<string> {
  if (req.storeId) return req.storeId
  const store = await prisma.store.findFirst({ select: { id: true } })
  return store?.id ?? 'default'
}

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function createTheme(storeId: string, input: unknown) {
  const parsed = themeSchema.safeParse(input)
  if (!parsed.success) throw createError(parsed.error.issues[0].message, 400)

  const { name, description, vars, css, sections } = parsed.data
  const slug = toSlug(name)
  if (!slug) throw createError('Invalid theme name', 400)

  const existing = await prisma.theme.findUnique({ where: { storeId_slug: { storeId, slug } } })
  if (existing) throw createError(`Theme "${slug}" already exists`, 409)

  return prisma.theme.create({
    data: {
      storeId,
      name,
      slug,
      description,
      vars,
      css: css ? sanitizeCss(css) : '',
      sections: sections ? (sections as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      isBuiltIn: false,
    },
  })
}

// GET /api/admin/themes — list all themes
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const themes = await prisma.theme.findMany({
      where: { storeId },
      orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'asc' }],
    })
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { activeTheme: true },
    })
    res.json({ success: true, data: { themes, activeTheme: store?.activeTheme ?? 'default' } })
  } catch (err) { next(err) }
})

// POST /api/admin/themes — create custom theme
router.post('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const theme = await createTheme(storeId, req.body)
    res.status(201).json({ success: true, data: theme })
  } catch (err) { next(err) }
})

// PUT /api/admin/themes/:slug — update custom theme
router.put('/:slug', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const { slug } = req.params

    const existing = await prisma.theme.findUnique({
      where: { storeId_slug: { storeId, slug } },
    })
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Theme not found' } })
    }
    if (existing.isBuiltIn) {
      return res.status(403).json({ success: false, error: { message: 'Cannot modify built-in themes' } })
    }

    const parsed = themeSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } })
    }

    const { name, description, vars, css, sections } = parsed.data
    const theme = await prisma.theme.update({
      where: { id: existing.id },
      data: { name, description, vars, css: css ? sanitizeCss(css) : '', sections: sections ? (sections as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    })

    res.json({ success: true, data: theme })
  } catch (err) { next(err) }
})

// DELETE /api/admin/themes/:slug — delete custom theme
router.delete('/:slug', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const { slug } = req.params

    const existing = await prisma.theme.findUnique({
      where: { storeId_slug: { storeId, slug } },
    })
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Theme not found' } })
    }
    if (existing.isBuiltIn) {
      return res.status(403).json({ success: false, error: { message: 'Cannot delete built-in themes' } })
    }

    // If deleting the active theme, fall back to default
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { activeTheme: true },
    })
    if (store?.activeTheme === slug) {
      await prisma.store.update({ where: { id: storeId }, data: { activeTheme: 'default' } })
    }

    await prisma.theme.delete({ where: { id: existing.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// PUT /api/admin/themes/:slug/activate — set as active theme
router.put('/:slug/activate', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const { slug } = req.params

    const theme = await prisma.theme.findUnique({
      where: { storeId_slug: { storeId, slug } },
    })
    if (!theme) {
      return res.status(404).json({ success: false, error: { message: 'Theme not found' } })
    }

    await prisma.store.update({ where: { id: storeId }, data: { activeTheme: slug } })
    res.json({ success: true, data: { activeTheme: slug } })
  } catch (err) { next(err) }
})

// GET /api/admin/themes/:slug/translations/:locale — translatable strings + any existing translation
router.get('/:slug/translations/:locale', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const { slug, locale } = req.params
    if (!isLocale(locale)) return res.status(400).json({ success: false, error: { message: 'Invalid locale' } })

    const theme = await prisma.theme.findUnique({
      where: { storeId_slug: { storeId, slug } },
      include: { translations: { where: { locale } } },
    })
    if (!theme) return res.status(404).json({ success: false, error: { message: 'Theme not found' } })

    const map = theme.translations[0]?.strings as unknown as ThemeTranslationMap | undefined
    const entries = describeThemeTranslations(theme.sections, map)

    res.json({ success: true, data: entries })
  } catch (err) { next(err) }
})

// Shared by the REST route and the setup-assistant tool dispatcher.
// `strings` may be a partial set — existing translated entries for paths not
// included are preserved via the merge with `current`'s freshly-extracted paths.
export async function saveThemeTranslation(storeId: string, slug: string, locale: string, strings: Record<string, string>) {
  const theme = await prisma.theme.findUnique({ where: { storeId_slug: { storeId, slug } } })
  if (!theme) throw createError('Theme not found', 404, 'NOT_FOUND')

  // Re-extract the CURRENT base strings server-side and only store entries whose
  // path still exists, always capturing `source` fresh — never trusting a
  // caller-sent source — so the staleness check downstream stays honest.
  const current = describeThemeTranslations(theme.sections)
  const currentByPath = new Map(current.map((e) => [e.path, e.source]))
  const map: ThemeTranslationMap = {}
  for (const [path, translated] of Object.entries(strings)) {
    const source = currentByPath.get(path)
    if (source !== undefined && translated.trim()) {
      map[path] = { source, translated }
    }
  }

  await prisma.themeTranslation.upsert({
    where: { themeId_locale: { themeId: theme.id, locale } },
    create: { themeId: theme.id, locale, strings: map as unknown as Prisma.InputJsonValue },
    update: { strings: map as unknown as Prisma.InputJsonValue },
  })

  return map
}

// PUT /api/admin/themes/:slug/translations/:locale — save translated strings
router.put('/:slug/translations/:locale', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const { slug, locale } = req.params
    if (!isLocale(locale)) return res.status(400).json({ success: false, error: { message: 'Invalid locale' } })

    const parsed = z.object({ strings: z.record(z.string()) }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } })
    }

    const map = await saveThemeTranslation(storeId, slug, locale, parsed.data.strings)
    res.json({ success: true, data: map })
  } catch (err) { next(err) }
})

export default router
