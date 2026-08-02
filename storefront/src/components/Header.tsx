'use client'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, usePathname, Link } from '@/i18n/navigation'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { ShoppingBag, User, Search, ChevronDown, Heart } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useWishlistStore } from '@/stores/wishlistStore'
import { useCustomerStore } from '@/stores/customerStore'
import { routing } from '@/i18n/routing'
import SearchOverlay from './SearchOverlay'
import { api } from '@/lib/api'
import type { NavItem } from '@/themes'

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN', fr: 'FR', de: 'DE', it: 'IT', es: 'ES',
}

interface Category {
  id: string
  name: string
  slug: string
}

function NavDropdown({ item, textColor }: { item: NavItem; textColor: string }) {
  const [open, setOpen] = useState(false)
  const hasChildren = item.children && item.children.length > 0

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link href={item.href} className={`inline-flex items-center gap-1 text-sm transition-colors ${textColor}`}>
        {item.label}
        {hasChildren && <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </Link>
      {open && hasChildren && (
        <div className="absolute top-full left-0 pt-2 z-50">
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[180px]">
            {item.children!.map((child, i) => (
              <Link key={i} href={child.href} className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Header({ variant = 'default', navItems, storeName = 'Store', logoUrl }: { variant?: string; navItems?: NavItem[]; storeName?: string; logoUrl?: string | null }) {
  const t = useTranslations('header')
  const count = useCartStore((s) => s.items.reduce((a, i) => a + i.quantity, 0))
  const wishlistCount = useWishlistStore((s) => s.items.length)
  const customer = useCustomerStore((s) => s.customer)
  const [mounted, setMounted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [shopOpen, setShopOpen] = useState(false)
  useEffect(() => setMounted(true), [])
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    api.get<{ success: boolean; data: Category[] }>('/store/categories', locale)
      .then((res) => setCategories(res.data))
      .catch(() => {})
  }, [locale])

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.replace(pathname, { locale: e.target.value })
  }

  const isCentered = variant === 'centered'
  const isOverlay = variant === 'overlay'
  const isTwoTier = variant === 'two-tier'
  const iconSize = isTwoTier ? 16 : 20
  const textColor = isOverlay ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
  const logoColor = isOverlay ? 'text-white' : 'text-gray-900'

  return (
    <header
      data-theme-section="header"
      data-variant={variant}
      className={`theme-header z-50 ${
        isOverlay
          ? 'fixed top-0 left-0 right-0 bg-transparent'
          : 'sticky top-0 bg-white border-b border-gray-200'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center ${
          isCentered
            ? 'flex-wrap justify-center'
            : isTwoTier
              ? 'flex-wrap'
              : 'justify-between h-16'
        }`}>
          {/* Actions */}
          <div className={`theme-header-actions flex items-center gap-4 ${
            isCentered
              ? 'order-1 w-full justify-end py-2 border-b border-gray-100'
              : isTwoTier
                ? 'order-1 w-full justify-end py-1.5 border-b border-gray-100'
                : ''
          }`}>
            <select
              value={locale}
              onChange={handleLocaleChange}
              className={`theme-header-locale text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer ${
                isTwoTier ? 'mr-auto' : ''
              } ${
                isOverlay ? 'text-white/80 border-white/20 bg-transparent' : 'text-gray-600 border-gray-200'
              }`}
            >
              {routing.locales.map((l) => (
                <option key={l} value={l} className="text-gray-900">{LOCALE_LABELS[l]}</option>
              ))}
            </select>

            <button onClick={() => setSearchOpen(true)} className={textColor}>
              <Search size={iconSize} />
            </button>
            <Link href="/wishlist" className={`relative ${textColor}`}>
              <Heart size={iconSize} />
              {mounted && wishlistCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                  {wishlistCount}
                </span>
              )}
            </Link>
            <Link href={mounted && customer ? '/account' : '/account/login'} className={textColor}>
              <User size={iconSize} className={mounted && customer ? 'text-primary' : ''} />
            </Link>
            <Link href="/cart" className={`relative ${textColor}`}>
              <ShoppingBag size={iconSize} />
              {mounted && count > 0 && (
                <span className="theme-header-cart-badge absolute -top-2 -right-2 bg-primary text-primary-text text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                  {count}
                </span>
              )}
            </Link>
          </div>

          {/* Logo */}
          <Link
            href="/"
            className={`theme-header-logo flex items-center ${!logoUrl ? `text-xl font-bold tracking-tight ${logoColor}` : ''} ${
              isCentered
                ? 'order-2 w-full justify-center py-3'
                : isTwoTier
                  ? 'order-3 py-3'
                  : ''
            }`}
          >
            {logoUrl ? (
              <Image src={logoUrl} alt={storeName} width={140} height={40} className="h-8 w-auto object-contain" priority />
            ) : (
              storeName
            )}
          </Link>

          {/* Nav */}
          <nav className={`theme-header-nav hidden md:flex items-center gap-8 ${
            isCentered
              ? 'order-3 w-full justify-center py-2'
              : isTwoTier
                ? 'order-4 ml-auto py-3'
                : ''
          }`}>
            {navItems && navItems.length > 0 ? (
              navItems.map((item, idx) => (
                <NavDropdown key={idx} item={item} textColor={textColor} />
              ))
            ) : (
              <>
                <div
                  className="relative"
                  onMouseEnter={() => setShopOpen(true)}
                  onMouseLeave={() => setShopOpen(false)}
                >
                  <Link href="/products" className={`inline-flex items-center gap-1 text-sm transition-colors ${textColor}`}>
                    {t('shop')}
                    {categories.length > 0 && <ChevronDown size={14} className={`transition-transform ${shopOpen ? 'rotate-180' : ''}`} />}
                  </Link>

                  {shopOpen && categories.length > 0 && (
                    <div className="absolute top-full left-0 pt-2 z-50">
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[180px]">
                        <Link href="/products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                          {t('allProducts')}
                        </Link>
                        <div className="border-t border-gray-100 my-1" />
                        {categories.map((cat) => (
                          <Link key={cat.id} href={`/products?category=${cat.slug}`} className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                            {cat.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Link href="/blog" className={`text-sm transition-colors ${textColor}`}>
                  Blog
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
      <div className="theme-slot theme-slot-header-after" aria-hidden="true" />
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </header>
  )
}
