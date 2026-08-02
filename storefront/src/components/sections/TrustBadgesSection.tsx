import { Shield, Truck, RefreshCw, Clock, Award, Headphones, CreditCard, Lock, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  truck: Truck,
  refresh: RefreshCw,
  clock: Clock,
  award: Award,
  headphones: Headphones,
  'credit-card': CreditCard,
  lock: Lock,
}

interface Badge {
  icon: string
  label: string
  description?: string
}

export default function TrustBadgesSection({ items = [], variant = 'default' }: { items?: Badge[]; variant?: string }) {
  if (items.length === 0) return null

  const isCompact = variant === 'compact'

  if (variant === 'spec-strip') {
    return (
      <section data-theme-section="home-trust" data-variant="spec-strip" className="theme-home-trust">
        <div className="theme-spec-strip-grid">
          {items.map((badge, i) => (
            <div key={i} className="theme-spec">
              {badge.description && <span className="theme-spec-k">{badge.description}</span>}
              <span className="theme-spec-v">{badge.label}</span>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section data-theme-section="home-trust" data-variant={variant} className="theme-home-trust border-y border-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex flex-wrap justify-center ${isCompact ? 'gap-8' : 'gap-12'}`}>
          {items.map((badge, i) => {
            const Icon = ICONS[badge.icon] ?? Shield
            return (
              <div key={i} className="flex items-center gap-3 text-center">
                <Icon size={isCompact ? 20 : 28} className="text-primary flex-shrink-0" />
                <div className="text-left">
                  <p className={`font-semibold ${isCompact ? 'text-xs' : 'text-sm'}`}>{badge.label}</p>
                  {badge.description && !isCompact && (
                    <p className="text-xs text-gray-500">{badge.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
