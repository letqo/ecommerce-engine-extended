import { useState } from 'react'
import { X, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface AIEnhanceResult {
  description: string
  shortDescription: string
  vendor: string
  metaTitle: string
  metaDescription: string
  tags: string[]
  variantRenames: { variantId: string; title: string; options: Record<string, string> }[]
  missingInfo: string[]
}

interface Props {
  result: AIEnhanceResult
  currentVariants: { id?: string; title: string; options: Record<string, string> }[]
  onApplyFields: (fields: Record<string, any>) => void
  onApplyVariant: (variantId: string, title: string, options: Record<string, string>) => void
  onClose: () => void
}

function Section({
  title,
  children,
  onApply,
  applied,
}: {
  title: string
  children: React.ReactNode
  onApply: () => void
  applied: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-left hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          {applied ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> : <span className="w-4 h-4" />}
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {children}
          <Button
            type="button"
            size="sm"
            variant={applied ? 'outline' : 'default'}
            onClick={onApply}
            className="w-full"
          >
            {applied ? 'Applied ✓' : 'Apply'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function AIEnhancePanel({ result, currentVariants, onApplyFields, onApplyVariant, onClose }: Props) {
  const [applied, setApplied] = useState<Record<string, boolean>>({})
  const [appliedVariants, setAppliedVariants] = useState<Set<string>>(new Set())

  const mark = (key: string) => setApplied((p) => ({ ...p, [key]: true }))

  const applyDescription = () => {
    onApplyFields({ description: result.description })
    mark('description')
  }

  const applyShortDescription = () => {
    onApplyFields({ shortDescription: result.shortDescription })
    mark('shortDescription')
  }

  const applyVendor = () => {
    onApplyFields({ vendor: result.vendor })
    mark('vendor')
  }

  const applySeo = () => {
    onApplyFields({ metaTitle: result.metaTitle, metaDescription: result.metaDescription })
    mark('seo')
  }

  const applyTags = () => {
    onApplyFields({ tags: result.tags.join(', ') })
    mark('tags')
  }

  const applyVariant = (r: AIEnhanceResult['variantRenames'][number]) => {
    onApplyVariant(r.variantId, r.title, r.options)
    setAppliedVariants((p) => new Set([...p, r.variantId]))
  }

  const applyAllVariants = () => {
    result.variantRenames.forEach((r) => {
      onApplyVariant(r.variantId, r.title, r.options)
    })
    setAppliedVariants(new Set(result.variantRenames.map((r) => r.variantId)))
    mark('variants')
  }

  const applyAll = () => {
    applyDescription()
    applyShortDescription()
    applyVendor()
    applySeo()
    applyTags()
    applyAllVariants()
  }

  const allApplied =
    applied.description && applied.shortDescription && applied.vendor && applied.seo && applied.tags && applied.variants

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex-shrink-0">
        <div>
          <p className="font-semibold text-sm">AI Suggestions</p>
          <p className="text-xs text-violet-200">Review and apply each suggestion</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        <Section title="Description" onApply={applyDescription} applied={!!applied.description}>
          <div
            className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto prose prose-xs"
            dangerouslySetInnerHTML={{ __html: result.description }}
          />
        </Section>

        {/* Short description */}
        <Section title="Short Description" onApply={applyShortDescription} applied={!!applied.shortDescription}>
          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 italic">"{result.shortDescription}"</p>
        </Section>

        {/* Vendor */}
        <Section title="Vendor / Brand" onApply={applyVendor} applied={!!applied.vendor}>
          <p className="text-sm font-medium text-gray-900 bg-gray-50 rounded-lg px-3 py-2">{result.vendor}</p>
        </Section>

        {/* SEO */}
        <Section title="SEO" onApply={applySeo} applied={!!applied.seo}>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Meta title</p>
              <p className="text-xs text-gray-900 bg-gray-50 rounded px-2 py-1.5">{result.metaTitle}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Meta description</p>
              <p className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1.5">{result.metaDescription}</p>
            </div>
          </div>
        </Section>

        {/* Tags */}
        <Section title="Tags" onApply={applyTags} applied={!!applied.tags}>
          <div className="flex flex-wrap gap-1.5">
            {result.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        </Section>

        {/* Variants */}
        {result.variantRenames.length > 0 && (
          <div className="border-b">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-left hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                {applied.variants
                  ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                  : <span className="w-4 h-4" />}
                Variant Names ({result.variantRenames.length})
              </span>
            </button>
            <div className="px-4 pb-4 space-y-2">
              {result.variantRenames.map((r) => {
                const current = currentVariants.find((v) => v.id === r.variantId)
                const isApplied = appliedVariants.has(r.variantId)
                return (
                  <div key={r.variantId} className="flex items-start justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      {current && (
                        <p className="text-xs text-muted-foreground line-through truncate">{current.title}</p>
                      )}
                      <p className="text-xs font-medium text-gray-900 truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {Object.entries(r.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyVariant(r)}
                      className={`text-xs px-2 py-1 rounded flex-shrink-0 font-medium transition-colors ${
                        isApplied
                          ? 'bg-green-100 text-green-700'
                          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      }`}
                    >
                      {isApplied ? '✓' : 'Apply'}
                    </button>
                  </div>
                )
              })}
              <Button type="button" size="sm" variant="outline" onClick={applyAllVariants} className="w-full mt-2">
                Apply All Variant Names
              </Button>
            </div>
          </div>
        )}

        {/* Missing info */}
        {result.missingInfo.length > 0 && (
          <div className="px-4 py-4 border-b">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Missing Information
            </p>
            <ul className="space-y-1.5">
              {result.missingInfo.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">Add this info manually to the description.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
        <Button
          type="button"
          onClick={applyAll}
          disabled={!!allApplied}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
        >
          {allApplied ? 'All Applied ✓' : 'Apply All Suggestions'}
        </Button>
      </div>
    </div>
  )
}
