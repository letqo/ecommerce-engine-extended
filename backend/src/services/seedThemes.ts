import { prisma } from '../config/database'

const builtInThemes = [
  {
    slug: 'default',
    name: 'Default',
    description: 'Clean, minimal black and white',
    vars: {
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
    },
  },
  {
    slug: 'elegant',
    name: 'Elegant',
    description: 'Sophisticated deep rose with serif typography and pill buttons',
    vars: {
      '--primary': '#9f1239',
      '--primary-hover': '#881337',
      '--primary-text': '#ffffff',
      '--accent': '#d4a017',
      '--hero-bg': 'linear-gradient(135deg, #1c0a0a 0%, #4c1d1d 100%)',
      '--hero-text': '#fdf2f8',
      '--hero-sub': '#fce7f3',
      '--footer-bg': '#1c0a0a',
      '--footer-text': '#fca5a5',
      '--font-sans': "Georgia, 'Times New Roman', 'Palatino Linotype', serif",
      '--radius-btn': '9999px',
      '--radius-card': '1rem',
    },
  },
  {
    slug: 'bold',
    name: 'Bold',
    description: 'High-energy electric blue with sharp corners',
    vars: {
      '--primary': '#2563eb',
      '--primary-hover': '#1d4ed8',
      '--primary-text': '#ffffff',
      '--accent': '#f59e0b',
      '--hero-bg': 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 100%)',
      '--hero-text': '#ffffff',
      '--hero-sub': '#bfdbfe',
      '--footer-bg': '#1e1b4b',
      '--footer-text': '#93c5fd',
      '--font-sans': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      '--radius-btn': '0.25rem',
      '--radius-card': '0.375rem',
    },
  },
]

export async function seedBuiltInThemes() {
  const store =
    (await prisma.store.findFirst({ select: { id: true } })) ??
    (await prisma.store.create({ data: { id: 'default' } }))

  for (const theme of builtInThemes) {
    await prisma.theme.upsert({
      where: { storeId_slug: { storeId: store.id, slug: theme.slug } },
      update: { name: theme.name, description: theme.description, vars: theme.vars, isBuiltIn: true },
      create: {
        storeId: store.id,
        slug: theme.slug,
        name: theme.name,
        description: theme.description,
        vars: theme.vars,
        css: '',
        isBuiltIn: true,
      },
    })
  }

  console.log('✅ Built-in themes seeded')
}
