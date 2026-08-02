import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

interface HeroBannerProps {
  variant?: string
  headline?: string | null
  subtext?: string | null
  ctaText?: string | null
  ctaLink?: string | null
  bannerUrl?: string | null
}

export default function HeroBanner({ variant = 'default', headline, subtext, ctaText, ctaLink, bannerUrl }: HeroBannerProps) {
  const t = useTranslations('hero')
  const title = headline || t('headline')
  const sub = subtext || t('subtext')
  const cta = ctaText || t('cta')
  const href = ctaLink || '/products'

  const isCentered = variant === 'centered'
  const isSplit = variant === 'split'
  const isBanner = variant === 'banner'
  const isShowcase = variant === 'showcase'

  return (
    <section
      data-theme-section="hero"
      data-variant={variant}
      className={`theme-hero relative ${
        isSplit || isShowcase
          ? 'grid grid-cols-1 md:grid-cols-2'
          : ''
      } ${
        isCentered ? 'min-h-[80vh] flex items-center justify-center' : ''
      } ${
        isSplit ? 'min-h-[80vh]' : ''
      } ${
        isShowcase ? 'min-h-[60vh]' : ''
      }`}
      style={
        bannerUrl
          ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'var(--hero-bg)' }
      }
    >
      <div className="theme-slot theme-slot-hero-before" aria-hidden="true" />

      {/* Text content */}
      <div className={`${
        isBanner
          ? 'flex flex-col md:flex-row items-center justify-between gap-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12'
          : isSplit
            ? 'flex items-center px-6 sm:px-12 lg:px-20 py-20 md:py-0'
            : isShowcase
              ? 'flex items-center px-6 sm:px-12 lg:px-20 py-20 md:py-0'
              : isCentered
                ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'
                : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32'
      }`}>
        <div className={`theme-hero-content ${
          isCentered
            ? 'text-center max-w-xl mx-auto flex flex-col items-center'
            : isBanner
              ? ''
              : isShowcase
                ? 'max-w-lg'
                : 'max-w-2xl'
        }`}>
          <h1 className={`theme-hero-title font-bold leading-tight mb-6 text-hero-text ${
            isCentered
              ? 'text-5xl md:text-7xl'
              : isBanner
                ? 'text-xl md:text-2xl mb-2'
                : isShowcase
                  ? 'text-3xl md:text-4xl'
                  : 'text-4xl md:text-6xl'
          }`}>
            {title}
          </h1>
          {!isBanner && (
            <p className={`theme-hero-subtitle text-hero-sub ${
              isCentered ? 'text-lg md:text-xl mb-10' : isShowcase ? 'text-base mb-8 leading-relaxed' : 'text-lg md:text-xl mb-10'
            }`}>
              {sub}
            </p>
          )}
          <Link
            href={href}
            className={`theme-hero-cta inline-block bg-white text-gray-900 font-semibold rounded-btn hover:bg-gray-100 transition-colors ${
              isBanner ? 'px-6 py-2.5 text-sm' : 'px-8 py-4 text-lg'
            }`}
          >
            {cta}
          </Link>
        </div>
      </div>

      {/* Visual column for split variant */}
      {isSplit && (
        <div className="theme-hero-visual hidden md:flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5" />
      )}

      {/* Showcase column */}
      {isShowcase && (
        <div className="theme-hero-showcase hidden md:flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5" />
      )}

      <div className="theme-slot theme-slot-hero-after" aria-hidden="true" />
    </section>
  )
}
