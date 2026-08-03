import { useTranslations } from 'next-intl'

export default function BrandStatement({ eyebrow }: { eyebrow?: string }) {
  // Note: useTranslations() suspends internally on first render (via React's `use()`);
  // wrapping it in try/catch swallows that Suspense signal and silently breaks the
  // section, so this must be called unguarded.
  const t = useTranslations('brand')
  const statement = t('statement')

  if (!statement || statement === 'brand.statement') return null

  return (
    <section id="the-idea" data-theme-section="home-brand" className="theme-home-brand">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        {eyebrow && <span className="theme-eyebrow block mb-1">{eyebrow}</span>}
        <p className="text-xl md:text-2xl text-gray-600 leading-relaxed font-light">
          {statement}
        </p>
      </div>
    </section>
  )
}
