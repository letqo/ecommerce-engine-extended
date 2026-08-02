import { cn } from '@/lib/utils'

export const LOCALES = ['fr', 'de', 'it', 'es', 'en'] as const
export type LocaleCode = (typeof LOCALES)[number]

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  en: 'English',
}

interface LocalePillsProps {
  active: 'default' | LocaleCode
  onChange: (value: 'default' | LocaleCode) => void
  /** Locales that already have at least one translated field filled in */
  filled: Set<string>
}

export default function LocalePills({ active, onChange, filled }: LocalePillsProps) {
  const pills: { value: 'default' | LocaleCode; label: string }[] = [
    { value: 'default', label: 'Default' },
    ...LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] })),
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            'relative rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            active === p.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-transparent text-muted-foreground hover:bg-secondary'
          )}
        >
          {p.label}
          {p.value !== 'default' && !filled.has(p.value) && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full',
                active === p.value ? 'bg-primary-foreground/60' : 'bg-muted-foreground/40'
              )}
              title="Not translated yet"
            />
          )}
        </button>
      ))}
    </div>
  )
}
