import type { SupplierKey } from '@prisma/client'

// Shared plumbing for "configurable" suppliers — every supplier added after CJ/AliExpress.
//
// CJ and AliExpress read their credentials from process env, because they were built when this
// was a single-business platform. Everything added since is configured PER STORE: the same
// deployment serves several stores, and each one has its own Printful/Gelato/BigBuy/Woo
// account. Their credentials therefore live in `StoreSupplier.settings` (a JSON blob) and are
// handed to the adapter at construction time instead of being read from the environment.

export type SupplierSettings = Record<string, string>

// The set of configurable supplier keys — a subset of the Prisma SupplierKey enum. CJ,
// ALIEXPRESS and MANUAL are deliberately NOT in here: they keep their existing code paths.
export const CONFIGURABLE_SUPPLIER_KEYS = ['PRINTFUL', 'GELATO', 'BIGBUY', 'WOO_BRIDGE'] as const
export type ConfigurableSupplierKey = (typeof CONFIGURABLE_SUPPLIER_KEYS)[number]

export function isConfigurableSupplierKey(key: SupplierKey | string): key is ConfigurableSupplierKey {
  return (CONFIGURABLE_SUPPLIER_KEYS as readonly string[]).includes(key)
}

// One settings field, as rendered by the admin Integrations page and described to the Setup
// Assistant. `secret: true` means "render masked, redact on read back".
export interface SupplierSettingField {
  name: string
  label: string
  help?: string
  required: boolean
  secret: boolean
  placeholder?: string
}

// What a supplier can actually do. Used by the admin UI to explain the integration and by the
// Setup Assistant's get_supplier_capabilities tool. These are honest flags — several of the new
// adapters genuinely can't do keyword catalog search, and saying so is more useful than
// pretending.
export interface SupplierCapabilities {
  // Keyword search across the supplier's catalog.
  search: boolean
  // Fetch one product by its supplier-side id.
  productImport: boolean
  // Submit an order through the supplier's API.
  orderSubmission: boolean
  // Poll order status/tracking.
  trackingPolling: boolean
  // Receive push updates (adapter exposes webhook parsing helpers).
  webhooks: boolean
  // Can answer "does this ship to country X".
  marketAvailability: boolean
}

export interface ConfigurableSupplierMeta {
  key: ConfigurableSupplierKey
  displayName: string
  description: string
  docsUrl?: string
  capabilities: SupplierCapabilities
  settingFields: SupplierSettingField[]
}

// Thrown when an adapter is constructed without the settings it needs. Callers surface the
// message straight to the store owner, so it names the missing field.
export class SupplierConfigError extends Error {
  constructor(supplier: string, field: string) {
    super(`${supplier} is not fully configured — missing "${field}". Set it in Admin → Integrations.`)
    this.name = 'SupplierConfigError'
  }
}

export function requireSetting(config: SupplierSettings, supplier: string, field: string): string {
  const value = config?.[field]
  if (typeof value !== 'string' || value.trim() === '') throw new SupplierConfigError(supplier, field)
  return value.trim()
}

export function optionalSetting(config: SupplierSettings, field: string): string | undefined {
  const value = config?.[field]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

// A settings key is treated as secret if it looks like one. Used both to drive the admin form's
// masked inputs and to redact values on GET — see routes/admin/storeSuppliers.ts.
export function isSecretSettingKey(key: string): boolean {
  return /key|secret|token|password/i.test(key)
}
