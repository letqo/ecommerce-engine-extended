import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import '../globals.css'
import { routing } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { getThemeConfig } from '@/themes'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getStoreInfo, STORE_URL } from '@/lib/seo'
import CookieConsent from '@/components/CookieConsent'
import { CurrencyProvider } from '@/lib/currency'
import UtilityClock from '@/components/UtilityClock'

const OG_LOCALE: Record<string, string> = {
  en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', es: 'es_ES',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const store = await getStoreInfo()
  const name = store?.name ?? 'Store'
  const description = store?.description ?? 'Quality products delivered fast.'
  return {
    title: { default: name, template: `%s | ${name}` },
    description,
    metadataBase: new URL(STORE_URL),
    icons: store?.faviconUrl ? { icon: store.faviconUrl } : undefined,
    openGraph: {
      siteName: name,
      type: 'website',
      locale: OG_LOCALE[locale] ?? 'en_US',
    },
    twitter: { card: 'summary_large_image' },
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!routing.locales.includes(locale as any)) notFound()

  const messages = await getMessages()
  const { vars, css: customCss, sections } = await getThemeConfig(locale)
  const store = await getStoreInfo()
  const storeName = store?.name ?? 'Store'
  const currency = store?.currency ?? 'USD'

  const cssVars = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')

  return (
    <html lang={locale}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />
        {customCss && (
          <style id="theme-custom-css" dangerouslySetInnerHTML={{ __html: customCss }} />
        )}
      </head>
      <body
        className="flex flex-col min-h-screen bg-white text-gray-900"
        data-cart-layout={sections.cartLayout}
        data-checkout-layout={sections.checkoutLayout}
        data-product-card={sections.productCard}
        data-product-detail={sections.productDetail}
      >
        <NextIntlClientProvider messages={messages}>
          <CurrencyProvider currency={currency}>
            {(() => {
              const storeMessage = store?.announcementActive && store.announcementText ? store.announcementText : null
              const messages = storeMessage ? [storeMessage] : sections.announcementBar?.messages ?? []
              if (messages.length === 0) return null
              const isUtility = sections.announcementBar?.variant === 'utility'

              if (isUtility) {
                return (
                  <div data-theme-section="announcement-bar" data-variant="utility" className="theme-announcement-bar bg-primary text-primary-text text-xs py-1.5">
                    <div className="theme-utility-bar-row max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                      {storeMessage && store?.announcementLink ? (
                        <Link href={store.announcementLink} className="hover:underline">{storeMessage}</Link>
                      ) : (
                        <span>{messages[0]}</span>
                      )}
                      {sections.announcementBar?.showClock && <UtilityClock />}
                    </div>
                  </div>
                )
              }

              return (
                <div data-theme-section="announcement-bar" className="theme-announcement-bar bg-primary text-primary-text text-xs text-center py-1.5 overflow-hidden">
                  <div className="animate-marquee whitespace-nowrap">
                    {storeMessage ? (
                      [0, 1].map((i) =>
                        store?.announcementLink ? (
                          <Link key={i} href={store.announcementLink} className="mx-8 hover:underline">{storeMessage}</Link>
                        ) : (
                          <span key={i} className="mx-8">{storeMessage}</span>
                        )
                      )
                    ) : (
                      messages.map((msg, i) => <span key={i} className="mx-8">{msg}</span>)
                    )}
                  </div>
                </div>
              )
            })()}
            <Header variant={sections.header.variant} navItems={sections.header.navItems} storeName={storeName} logoUrl={store?.logoUrl} />
            <main className="flex-1">{children}</main>
            <Footer variant={sections.footer.variant} hideNewsletter={sections.home.some((s) => s.type === 'newsletter')} storeName={storeName} />
            <CookieConsent />
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
