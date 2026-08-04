import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import HeroCarousel from './HeroCarousel'

interface HeroBannerProps {
  variant?: string
  eyebrow?: string | null
  headline?: string | null
  subtext?: string | null
  ctaText?: string | null
  ctaLink?: string | null
  bannerUrl?: string | null
  bannerUrls?: string[] | null
  secondaryCta?: { label: string; href: string } | null
}

// Splits "Displays that *go still* when you look away." into plain-text runs
// and an accent-colored <em> for the *starred* phrase, so store owners can
// mark up hero copy without needing HTML.
function renderHeadline(title: string) {
  const parts = title.split(/\*(.+?)\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <em key={i} className="theme-hero-em">{part}</em> : <span key={i}>{part}</span>
  )
}

export default function HeroBanner({ variant = 'default', eyebrow, headline, subtext, ctaText, ctaLink, bannerUrl, bannerUrls, secondaryCta }: HeroBannerProps) {
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
        isShowcase ? 'min-h-[75vh] md:min-h-[90vh]' : ''
      }`}
      style={
        bannerUrl && !isShowcase
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
          {eyebrow && !isBanner && (
            <span className="theme-hero-eyebrow block">{eyebrow}</span>
          )}
          <h1 className={`theme-hero-title font-bold leading-tight mb-6 text-hero-text ${
            isCentered
              ? 'text-5xl md:text-7xl'
              : isBanner
                ? 'text-xl md:text-2xl mb-2'
                : isShowcase
                  ? 'text-3xl md:text-4xl'
                  : 'text-4xl md:text-6xl'
          }`}>
            {renderHeadline(title)}
          </h1>
          {!isBanner && (
            <p className={`theme-hero-subtitle text-hero-sub ${
              isCentered ? 'text-lg md:text-xl mb-10' : isShowcase ? 'text-base mb-8 leading-relaxed' : 'text-lg md:text-xl mb-10'
            }`}>
              {sub}
            </p>
          )}
          <div className="theme-hero-cta-row flex items-center gap-3.5 flex-wrap">
            <Link
              href={href}
              className={`theme-hero-cta inline-block bg-white text-gray-900 font-semibold rounded-btn hover:bg-gray-100 transition-colors ${
                isBanner ? 'px-6 py-2.5 text-sm' : 'px-8 py-4 text-lg'
              }`}
            >
              {cta}
            </Link>
            {secondaryCta && !isBanner && (
              <Link
                href={secondaryCta.href}
                className="theme-hero-cta-secondary inline-block font-semibold transition-colors px-8 py-4 text-lg"
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Visual column for split variant */}
      {isSplit && (
        <div className="theme-hero-visual hidden md:flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5" />
      )}

      {/* Showcase column — an auto-advancing carousel when multiple images are set (bannerUrls),
          a single real product photo when just one is (bannerUrl, kept for back-compat), or the
          device-screen illustration as a placeholder when neither is. */}
      {isShowcase && (
        <div className="theme-hero-showcase hidden md:flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5">
          {bannerUrls && bannerUrls.length > 0 ? (
            <HeroCarousel images={bannerUrls} />
          ) : bannerUrl ? (
            <div className="theme-hero-bezel-wrap w-full">
              <div className="theme-hero-bezel">
                <div className="theme-hero-screen relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bannerUrl} alt="" className="theme-hero-showcase-image absolute inset-0 w-full h-full object-contain" />
                </div>
              </div>
            </div>
          ) : (
            <div className="theme-device">
              <div className="theme-device-screen theme-device-refresh">
                <span className="theme-device-month">{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                <span className="theme-device-date">{new Date().getDate()}</span>
                <span className="theme-device-caption">
                  <span>62% battery</span>
                  <span>Refreshed 06:00</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="theme-slot theme-slot-hero-after" aria-hidden="true" />
    </section>
  )
}
