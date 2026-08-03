import type { ComplianceProfile } from '@prisma/client'

// Compliance profiles — the "you may not publish this until you've disclosed X" mechanism.
//
// Different product categories carry different legal disclosure duties (an EU-facing store
// selling toys owes a choking-hazard warning; selling electronics owes CE/WEEE details). Rather
// than bolt category-specific columns onto Product, a category (or an individual product) is
// tagged with a ComplianceProfile, and this file is the single registry saying which fields
// that profile requires. Everything else — the admin editor's form, the product API's
// publish-time validation, the Store Health audit, the storefront's disclosure block — is
// generated from this registry, so adding a profile is a one-file change here plus the enum
// value in schema.prisma.
//
// These are disclosure requirements, not legal advice. The registry says "this field must be
// filled in before publishing"; it does not verify the content is correct or sufficient.

export interface ComplianceField {
  key: string
  label: string
  help?: string
  // Rendered as a textarea rather than a single-line input in the admin editor.
  multiline?: boolean
}

export interface ComplianceProfileDefinition {
  key: Exclude<ComplianceProfile, 'NONE'>
  label: string
  description: string
  fields: ComplianceField[]
}

export const COMPLIANCE_PROFILES: Record<Exclude<ComplianceProfile, 'NONE'>, ComplianceProfileDefinition> = {
  COSMETICS: {
    key: 'COSMETICS',
    label: 'Cosmetics',
    description:
      'Products applied to the body: skincare, haircare, make-up, fragrance. Requires an ingredient declaration and a named responsible person inside the EU.',
    fields: [
      {
        key: 'inciIngredients',
        label: 'INCI Ingredients',
        help: 'Full ingredient list in INCI nomenclature, in descending order of weight.',
        multiline: true,
      },
      { key: 'netQuantity', label: 'Net Quantity', help: 'Contents by weight or volume, e.g. "50 ml" or "100 g".' },
      {
        key: 'usageWarnings',
        label: 'Usage Warnings',
        help: 'Precautions and warnings that must appear with the product.',
        multiline: true,
      },
      {
        key: 'responsiblePersonInfo',
        label: 'Responsible Person (name + EU address)',
        help: 'The person or company established in the EU who is accountable for this product.',
        multiline: true,
      },
    ],
  },

  ELECTRONICS: {
    key: 'ELECTRONICS',
    label: 'Electronics',
    description:
      'Mains- or battery-powered goods. Requires conformity marking, an electrical rating, and waste-electronics registration.',
    fields: [
      {
        key: 'ceMarking',
        label: 'CE Marking Confirmed',
        help: 'Confirm the product carries CE marking, and note the standards it conforms to.',
      },
      { key: 'voltageRating', label: 'Voltage/Power Rating', help: 'e.g. "100-240V AC, 50/60Hz, 12W" or "3.7V 2000mAh Li-ion".' },
      {
        key: 'weeeRegistration',
        label: 'WEEE Registration Number',
        help: 'Waste Electrical and Electronic Equipment producer registration number.',
      },
    ],
  },

  TOYS_CHILDREN: {
    key: 'TOYS_CHILDREN',
    label: 'Toys & Children’s Products',
    description:
      'Anything designed for or likely to be used by children. Requires an age rating, conformity marking, and a small-parts warning.',
    fields: [
      { key: 'minimumAge', label: 'Minimum Age', help: 'e.g. "3+" or "36 months and over".' },
      { key: 'ceMarking', label: 'CE Marking Confirmed', help: 'Confirm CE marking under the Toy Safety Directive.' },
      {
        key: 'chokingHazardWarning',
        label: 'Choking Hazard Warning Text',
        help: 'The exact warning shown to customers, e.g. "WARNING: Small parts. Not for children under 3 years."',
        multiline: true,
      },
    ],
  },

  FOOD_CONTACT: {
    key: 'FOOD_CONTACT',
    label: 'Food-Contact Items',
    description: 'Cookware, tableware, storage and utensils that touch food. Requires a materials declaration.',
    fields: [
      {
        key: 'materialSafety',
        label: 'Food-Contact Material Declaration',
        help: 'Which materials touch food and the standard they comply with, e.g. "BPA-free Tritan, compliant with EC 1935/2004".',
        multiline: true,
      },
    ],
  },

  TEXTILE: {
    key: 'TEXTILE',
    label: 'Textiles',
    description: 'Clothing and fabric goods. Requires a fibre breakdown and care instructions.',
    fields: [
      { key: 'fiberComposition', label: 'Fiber Composition', help: 'e.g. "80% cotton, 20% polyester". Must total 100%.' },
      { key: 'careInstructions', label: 'Care Instructions', help: 'Washing, drying and ironing guidance.', multiline: true },
    ],
  },
}

export function listComplianceProfiles(): ComplianceProfileDefinition[] {
  return Object.values(COMPLIANCE_PROFILES)
}

// A product's own profile wins when set (including an explicit NONE, which is how a store
// exempts one product from its category's profile). Otherwise it inherits the category's.
export function resolveComplianceProfile(
  productProfile: ComplianceProfile | null | undefined,
  categoryProfile: ComplianceProfile | null | undefined
): ComplianceProfile {
  return productProfile ?? categoryProfile ?? 'NONE'
}

export function getProfileDefinition(profile: ComplianceProfile): ComplianceProfileDefinition | null {
  if (profile === 'NONE') return null
  return COMPLIANCE_PROFILES[profile] ?? null
}

export function getRequiredFields(profile: ComplianceProfile): ComplianceField[] {
  return getProfileDefinition(profile)?.fields ?? []
}

// Returns the fields the profile requires that aren't filled in. Whitespace-only counts as
// missing. Non-string values (a checkbox saved as `true`, a number) count as present as long
// as they aren't null/undefined/empty — the registry doesn't dictate value types.
export function findMissingComplianceFields(
  profile: ComplianceProfile,
  complianceData: unknown
): ComplianceField[] {
  const required = getRequiredFields(profile)
  if (required.length === 0) return []
  const data = (complianceData && typeof complianceData === 'object' ? complianceData : {}) as Record<string, unknown>

  return required.filter((field) => {
    const value = data[field.key]
    if (value === null || value === undefined) return true
    if (typeof value === 'string') return value.trim() === ''
    if (Array.isArray(value)) return value.length === 0
    return false
  })
}

// One shared sentence, so the API error, the Store Health finding and the assistant all
// describe the problem identically.
export function describeMissingFields(profile: ComplianceProfile, missing: ComplianceField[]): string {
  const def = getProfileDefinition(profile)
  const labels = missing.map((f) => f.label).join(', ')
  return `This product is in the "${def?.label ?? profile}" compliance profile and cannot be published until these fields are filled in: ${labels}.`
}
