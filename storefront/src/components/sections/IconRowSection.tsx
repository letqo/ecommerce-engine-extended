import Link from 'next/link'
import { Sparkles, Droplets, Palette, Leaf, Sun, Gem, Coffee, Shirt, Home, Zap, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  droplets: Droplets,
  palette: Palette,
  leaf: Leaf,
  sun: Sun,
  gem: Gem,
  coffee: Coffee,
  shirt: Shirt,
  home: Home,
  zap: Zap,
}

interface IconItem {
  icon: string
  label: string
  href?: string
}

export default function IconRowSection({ items = [], heading }: { items?: IconItem[]; heading?: string }) {
  if (items.length === 0) return null

  return (
    <section data-theme-section="home-icon-row" className="theme-home-icon-row max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {heading && <h2 className="text-2xl font-bold mb-8 text-center">{heading}</h2>}
      <div className="flex flex-wrap justify-center gap-6 md:gap-10">
        {items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Sparkles
          const content = (
            <div className="flex flex-col items-center gap-2 group">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Icon size={24} className="text-gray-600 group-hover:text-primary transition-colors" />
              </div>
              <span className="text-xs font-medium text-gray-700 group-hover:text-primary transition-colors">{item.label}</span>
            </div>
          )
          return item.href ? (
            <Link key={i} href={item.href}>{content}</Link>
          ) : (
            <div key={i}>{content}</div>
          )
        })}
      </div>
    </section>
  )
}
