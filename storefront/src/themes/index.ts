import defaultVars from './default.json'
import elegantVars from './elegant.json'
import boldVars from './bold.json'

const fallbackThemes: Record<string, { vars: Record<string, string> }> = {
  default: defaultVars,
  elegant: elegantVars,
  bold: boldVars,
}

const REQUIRED_VARS = [
  '--primary', '--primary-hover', '--primary-text', '--accent',
  '--hero-bg', '--hero-text', '--hero-sub',
  '--footer-bg', '--footer-text',
  '--font-sans', '--radius-btn', '--radius-card',
]

export interface NavItem {
  label: string
  href: string
  children?: Array<{ label: string; href: string }>
}

export interface HomeSection {
  type: string
  variant?: string
  heading?: string
  text?: string
  cta?: { label: string; href: string }
  imageUrl?: string
  imagePosition?: 'left' | 'right'
  videoUrl?: string
  targetDate?: string
  items?: Array<Record<string, unknown>>
}

export interface ThemeSections {
  header: { variant: 'default' | 'centered' | 'overlay' | 'two-tier'; navItems?: NavItem[] }
  footer: { variant: 'default' | 'minimal' | 'newsletter' | 'mega' }
  home: HomeSection[]
  productsGrid: 'grid-4' | 'grid-3' | 'grid-2'
  productDetail: 'side-by-side' | 'stacked' | 'gallery-sticky'
  productCard: 'default' | 'overlay' | 'detailed' | 'plate'
  cartLayout: 'sidebar' | 'bottom-bar'
  checkoutLayout: 'two-column' | 'single-column'
  announcementBar?: { messages: string[]; speed?: number }
}

export const DEFAULT_SECTIONS: ThemeSections = {
  header: { variant: 'default' },
  footer: { variant: 'default' },
  home: [
    { type: 'hero', variant: 'default' },
    { type: 'featured-products', variant: 'grid-4' },
  ],
  productsGrid: 'grid-4',
  productDetail: 'side-by-side',
  productCard: 'default',
  cartLayout: 'sidebar',
  checkoutLayout: 'two-column',
}

export function resolveSections(raw: unknown): ThemeSections {
  if (!raw || typeof raw !== 'object') return DEFAULT_SECTIONS
  const s = raw as Partial<ThemeSections>
  return {
    header: s.header ?? DEFAULT_SECTIONS.header,
    footer: s.footer ?? DEFAULT_SECTIONS.footer,
    home: s.home ?? DEFAULT_SECTIONS.home,
    productsGrid: s.productsGrid ?? DEFAULT_SECTIONS.productsGrid,
    productDetail: s.productDetail ?? DEFAULT_SECTIONS.productDetail,
    productCard: s.productCard ?? DEFAULT_SECTIONS.productCard,
    cartLayout: s.cartLayout ?? DEFAULT_SECTIONS.cartLayout,
    checkoutLayout: s.checkoutLayout ?? DEFAULT_SECTIONS.checkoutLayout,
    announcementBar: s.announcementBar ?? undefined,
  }
}

export interface ThemeConfig {
  activeTheme: string
  vars: Record<string, string>
  css: string
  sections: ThemeSections
}

function isValidVars(vars: unknown): vars is Record<string, string> {
  if (!vars || typeof vars !== 'object') return false
  return REQUIRED_VARS.every((k) => k in (vars as Record<string, string>))
}

export async function getThemeConfig(locale?: string): Promise<ThemeConfig> {
  try {
    const sep = locale ? `?locale=${locale}` : ''
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/store/store/theme-config${sep}`,
      {
        cache: 'no-store',
        headers: {
          'X-Store-Id': process.env.NEXT_PUBLIC_STORE_ID ?? '',
        },
      }
    )
    if (res.ok) {
      const json = await res.json()
      if (json.data && isValidVars(json.data.vars)) {
        return {
          ...json.data,
          sections: resolveSections(json.data.sections),
        }
      }
      const themeName = json.data?.activeTheme ?? 'default'
      const local = fallbackThemes[themeName] ?? fallbackThemes.default
      return { activeTheme: themeName, vars: local.vars, css: json.data?.css ?? '', sections: resolveSections(json.data?.sections) }
    }
  } catch {}
  return { activeTheme: 'default', vars: fallbackThemes.default.vars, css: '', sections: DEFAULT_SECTIONS }
}
