'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import NewsletterForm from './NewsletterForm'
import { api } from '@/lib/api'

interface Category {
  id: string
  name: string
  slug: string
}

export default function Footer({ variant = 'default', hideNewsletter = false, storeName = 'Store' }: { variant?: string; hideNewsletter?: boolean; storeName?: string }) {
  const t = useTranslations('footer')
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    api.get<{ success: boolean; data: Category[] }>('/store/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {})
  }, [])

  if (variant === 'minimal') {
    return (
      <footer data-theme-section="footer" data-variant="minimal" className="theme-footer bg-footer-bg text-footer-text mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="theme-slot theme-slot-footer-before" aria-hidden="true" />
          <div className="theme-footer-links flex flex-wrap justify-center gap-6 text-sm">
            <Link href="/products" className="hover:text-white transition-colors">{t('allProducts')}</Link>
            <Link href="/account/login" className="hover:text-white transition-colors">{t('myAccount')}</Link>
            <Link href="/privacy-policy" className="opacity-50 hover:opacity-100 hover:text-white transition-colors">{t('privacy')}</Link>
            <Link href="/terms-of-service" className="opacity-50 hover:opacity-100 hover:text-white transition-colors">{t('terms')}</Link>
          </div>
          <div className="theme-footer-copyright text-sm text-center mt-6 opacity-60">
            © {new Date().getFullYear()} {storeName}. {t('rights')}
          </div>
        </div>
      </footer>
    )
  }

  if (variant === 'newsletter') {
    return (
      <footer data-theme-section="footer" data-variant="newsletter" className="theme-footer bg-footer-bg text-footer-text mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="theme-slot theme-slot-footer-before" aria-hidden="true" />

          {!hideNewsletter && (
            <div className="theme-footer-newsletter text-center py-12">
              <h3 className="text-white font-bold text-xl mb-2">Get deals &amp; new arrivals</h3>
              <p className="text-sm opacity-70 mb-6">Join our list and be the first to know.</p>
              <div className="max-w-md mx-auto">
                <NewsletterForm />
              </div>
            </div>
          )}

          <div className="theme-footer-links grid grid-cols-3 gap-8 mt-10 pt-10 border-t border-white/10">
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">{t('shop')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/products" className="hover:text-white transition-colors">{t('allProducts')}</Link></li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <Link href={`/products?category=${cat.slug}`} className="hover:text-white transition-colors">
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">{t('support')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/account/login" className="hover:text-white transition-colors">{t('myAccount')}</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">{t('contact')}</Link></li>
                <li><Link href="/faq" className="hover:text-white transition-colors">{t('faq')}</Link></li>
                <li><Link href="/shipping-policy" className="hover:text-white transition-colors">{t('shipping')}</Link></li>
                <li><Link href="/return-policy" className="hover:text-white transition-colors">{t('returns')}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">{t('legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">{t('privacy')}</Link></li>
                <li><Link href="/terms-of-service" className="hover:text-white transition-colors">{t('terms')}</Link></li>
                <li><Link href="/about" className="hover:text-white transition-colors">{t('about')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="theme-footer-copyright border-t border-white/10 mt-10 pt-6 text-sm text-center">
            © {new Date().getFullYear()} {storeName}. {t('rights')}
          </div>
        </div>
      </footer>
    )
  }

  if (variant === 'mega') {
    return (
      <footer data-theme-section="footer" data-variant="mega" className="theme-footer bg-footer-bg text-footer-text mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="theme-slot theme-slot-footer-before" aria-hidden="true" />

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
            <div className="lg:flex-1">
              <h3 className="text-white font-bold text-lg mb-2">{storeName}</h3>
              <p className="text-sm mb-6">{t('tagline')}</p>
              {!hideNewsletter && (
                <div className="theme-footer-newsletter">
                  <p className="text-sm font-medium text-white mb-3">Get deals &amp; new arrivals</p>
                  <NewsletterForm />
                </div>
              )}
            </div>

            <div className="theme-footer-links grid grid-cols-3 gap-8 lg:gap-12">
              <div>
                <h4 className="text-white font-semibold mb-3 text-sm">{t('shop')}</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/products" className="hover:text-white transition-colors">{t('allProducts')}</Link></li>
                  {categories.map((cat) => (
                    <li key={cat.id}>
                      <Link href={`/products?category=${cat.slug}`} className="hover:text-white transition-colors">
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 text-sm">{t('support')}</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/account/login" className="hover:text-white transition-colors">{t('myAccount')}</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition-colors">{t('contact')}</Link></li>
                  <li><Link href="/faq" className="hover:text-white transition-colors">{t('faq')}</Link></li>
                  <li><Link href="/shipping-policy" className="hover:text-white transition-colors">{t('shipping')}</Link></li>
                  <li><Link href="/return-policy" className="hover:text-white transition-colors">{t('returns')}</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 text-sm">{t('legal')}</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/privacy-policy" className="hover:text-white transition-colors">{t('privacy')}</Link></li>
                  <li><Link href="/terms-of-service" className="hover:text-white transition-colors">{t('terms')}</Link></li>
                  <li><Link href="/about" className="hover:text-white transition-colors">{t('about')}</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="theme-footer-copyright border-t border-white/10 mt-10 pt-6 text-sm text-center">
            © {new Date().getFullYear()} {storeName}. {t('rights')}
          </div>
        </div>
      </footer>
    )
  }

  // Default variant
  return (
    <footer data-theme-section="footer" data-variant={variant} className="theme-footer bg-footer-bg text-footer-text mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="theme-slot theme-slot-footer-before" aria-hidden="true" />

        {!hideNewsletter && (
          <div className="theme-footer-newsletter rounded-2xl bg-white/10 px-6 py-8 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-white font-bold text-lg">Get deals &amp; new arrivals</h3>
              <p className="text-sm mt-1 opacity-70">Join our list and be the first to know.</p>
            </div>
            <NewsletterForm />
          </div>
        )}

        <div className="theme-footer-links grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-white font-bold text-lg mb-3">{storeName}</h3>
            <p className="text-sm">{t('tagline')}</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">{t('shop')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/products" className="hover:text-white transition-colors">{t('allProducts')}</Link></li>
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link href={`/products?category=${cat.slug}`} className="hover:text-white transition-colors">
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">{t('support')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/account/login" className="hover:text-white transition-colors">{t('myAccount')}</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">{t('contact')}</Link></li>
              <li><Link href="/faq" className="hover:text-white transition-colors">{t('faq')}</Link></li>
              <li><Link href="/shipping-policy" className="hover:text-white transition-colors">{t('shipping')}</Link></li>
              <li><Link href="/return-policy" className="hover:text-white transition-colors">{t('returns')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">{t('legal')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/privacy-policy" className="hover:text-white transition-colors">{t('privacy')}</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-white transition-colors">{t('terms')}</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">{t('about')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="theme-footer-copyright border-t border-white/10 mt-10 pt-6 text-sm text-center">
          © {new Date().getFullYear()} {storeName}. {t('rights')}
        </div>
      </div>
    </footer>
  )
}
