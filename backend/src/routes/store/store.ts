import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { applyStoreTranslation, translationsSelect } from '../../lib/translate'
import { applyThemeTranslation } from '../../lib/themeText'

const router = Router()

router.get('/theme', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { activeTheme: true } })
      : await prisma.store.findFirst({ select: { activeTheme: true } })
    res.json({ success: true, data: { activeTheme: store?.activeTheme ?? 'default' } })
  } catch (err) { next(err) }
})

const DEFAULT_VARS: Record<string, string> = {
  '--primary': '#000000',
  '--primary-hover': '#1a1a1a',
  '--primary-text': '#ffffff',
  '--accent': '#6366f1',
  '--hero-bg': 'linear-gradient(135deg, #111827 0%, #374151 100%)',
  '--hero-text': '#ffffff',
  '--hero-sub': '#d1d5db',
  '--footer-bg': '#111827',
  '--footer-text': '#9ca3af',
  '--font-sans': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--radius-btn': '0.75rem',
  '--radius-card': '0.75rem',
}

router.get('/theme-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, activeTheme: true } })
      : await prisma.store.findFirst({ select: { id: true, activeTheme: true } })

    if (!store) {
      return res.json({ success: true, data: { activeTheme: 'default', vars: DEFAULT_VARS, css: '', sections: null } })
    }

    const slug = store.activeTheme ?? 'default'

    let theme = null
    try {
      theme = await prisma.theme.findUnique({
        where: { storeId_slug: { storeId: store.id, slug } },
        select: { vars: true, css: true, sections: true, ...translationsSelect(locale) },
      })
    } catch {}

    const vars = theme?.vars && typeof theme.vars === 'object' && Object.keys(theme.vars as object).length > 0
      ? theme.vars as Record<string, string>
      : DEFAULT_VARS

    const translations = (theme as any)?.translations as { strings: unknown }[] | undefined
    const sections = translations?.[0]
      ? applyThemeTranslation(theme?.sections ?? null, translations[0].strings as any)
      : theme?.sections ?? null

    res.json({
      success: true,
      data: {
        activeTheme: slug,
        vars,
        css: theme?.css ?? '',
        sections,
      },
    })
  } catch (err) { next(err) }
})

router.get('/pages/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const locale = (req as any).locale as string | undefined
    const { slug } = req.params

    const fieldMap: Record<string, string[]> = {
      'privacy-policy': ['privacyPolicy'],
      'terms-of-service': ['termsOfService'],
      'shipping-policy': ['shippingPolicy'],
      'return-policy': ['returnPolicy'],
      'about': ['aboutUs', 'name', 'description'],
      'faq': ['faqContent'],
      'contact': ['contactEmail', 'contactPhone', 'address', 'name', 'socialLinks'],
    }

    const fields = fieldMap[slug]
    if (!fields) {
      return res.status(404).json({ success: false, error: { message: 'Page not found' } })
    }

    const select: Record<string, any> = {}
    for (const f of fields) select[f] = true
    Object.assign(select, translationsSelect(locale))

    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select })
      : await prisma.store.findFirst({ select })

    res.json({ success: true, data: store ? applyStoreTranslation(store, locale) : store })
  } catch (err) { next(err) }
})

router.get('/info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const infoSelect = {
      name: true, description: true, logoUrl: true, faviconUrl: true, currency: true, primaryColor: true,
      announcementActive: true, announcementText: true, announcementLink: true,
      heroHeadline: true, heroSubtext: true, heroCtaText: true, heroCtaLink: true, heroBannerUrl: true, heroBannerUrls: true,
      targetMarkets: true, shipToCountry: true,
    }
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: infoSelect })
      : await prisma.store.findFirst({ select: infoSelect })
    res.json({ success: true, data: store })
  } catch (err) { next(err) }
})

export default router
