'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ChevronRight, Home } from 'lucide-react'

interface Crumb {
  label: string
  href?: string
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations('breadcrumbs')

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
      <Link href="/" className="hover:text-gray-900 transition-colors flex items-center gap-1">
        <Home size={14} />
        <span>{t('home')}</span>
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={14} className="text-gray-300" />
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900 transition-colors">{item.label}</Link>
          ) : (
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
