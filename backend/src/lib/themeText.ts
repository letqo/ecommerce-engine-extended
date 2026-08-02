export interface ThemeStringEntry {
  path: string
  source: string
}

export interface ThemeStringTranslation {
  source: string
  translated: string
}

export type ThemeTranslationMap = Record<string, ThemeStringTranslation>

const ITEM_TEXT_KEYS = ['label', 'text', 'name', 'description', 'question', 'answer', 'alt'] as const

// Walks the theme's known, fixed section shape (the same shape enforced by
// admin/themes.ts's sectionsSchema) and pulls out every translatable leaf.
// Re-run fresh against the current sections every time — never diffed
// against a stored old structure — so there's no array-length ambiguity.
export function extractThemeStrings(sections: unknown): ThemeStringEntry[] {
  const out: ThemeStringEntry[] = []
  if (!sections || typeof sections !== 'object') return out
  const s = sections as any

  const navItems = s.header?.navItems
  if (Array.isArray(navItems)) {
    navItems.forEach((item: any, i: number) => {
      if (typeof item?.label === 'string') out.push({ path: `header.navItems[${i}].label`, source: item.label })
      if (Array.isArray(item?.children)) {
        item.children.forEach((child: any, j: number) => {
          if (typeof child?.label === 'string') {
            out.push({ path: `header.navItems[${i}].children[${j}].label`, source: child.label })
          }
        })
      }
    })
  }

  const messages = s.announcementBar?.messages
  if (Array.isArray(messages)) {
    messages.forEach((m: any, i: number) => {
      if (typeof m === 'string') out.push({ path: `announcementBar.messages[${i}]`, source: m })
    })
  }

  const home = s.home
  if (Array.isArray(home)) {
    home.forEach((section: any, i: number) => {
      if (typeof section?.heading === 'string') out.push({ path: `home[${i}].heading`, source: section.heading })
      if (typeof section?.text === 'string') out.push({ path: `home[${i}].text`, source: section.text })
      if (typeof section?.cta?.label === 'string') out.push({ path: `home[${i}].cta.label`, source: section.cta.label })
      if (Array.isArray(section?.items)) {
        section.items.forEach((item: any, j: number) => {
          for (const key of ITEM_TEXT_KEYS) {
            if (typeof item?.[key] === 'string') {
              out.push({ path: `home[${i}].items[${j}].${key}`, source: item[key] })
            }
          }
        })
      }
    })
  }

  return out
}

function setAtPath(obj: any, path: string, value: string): void {
  const keys = path.match(/[^.[\]]+/g)
  if (!keys) return
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    cur = cur[/^\d+$/.test(key) ? Number(key) : key]
    if (cur == null) return
  }
  const lastKey = keys[keys.length - 1]
  const k = /^\d+$/.test(lastKey) ? Number(lastKey) : lastKey
  if (cur[k] !== undefined) cur[k] = value
}

// Deep-clones the base sections and substitutes translated text wherever
// the stored translation's source text still exactly matches what's
// currently at that path. If the admin has since edited the base wording
// (or reordered things so the path now points elsewhere), the mismatch is
// treated as a stale translation and silently skipped — the shopper just
// sees the current base-language text at that one spot. Same non-blocking
// fallback principle as Product/Category/Store translations.
export function applyThemeTranslation(sections: unknown, map?: ThemeTranslationMap | null): unknown {
  if (!map || !sections || typeof sections !== 'object') return sections
  const cloned = JSON.parse(JSON.stringify(sections))
  const current = extractThemeStrings(cloned)
  for (const entry of current) {
    const translation = map[entry.path]
    if (translation && translation.source === entry.source) {
      setAtPath(cloned, entry.path, translation.translated)
    }
  }
  return cloned
}

// Used by the admin translations screen: for each currently-translatable
// string, report whether an existing translation is present and whether
// it's stale (source text no longer matches).
export function describeThemeTranslations(
  sections: unknown,
  map?: ThemeTranslationMap | null
): Array<{ path: string; source: string; translated: string; stale: boolean }> {
  const current = extractThemeStrings(sections)
  return current.map((entry) => {
    const translation = map?.[entry.path]
    if (!translation) return { path: entry.path, source: entry.source, translated: '', stale: false }
    const stale = translation.source !== entry.source
    return { path: entry.path, source: entry.source, translated: stale ? '' : translation.translated, stale }
  })
}
