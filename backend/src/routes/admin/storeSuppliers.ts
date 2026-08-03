import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { Prisma } from '@prisma/client'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { listConfigurableSuppliers, CONFIGURABLE_SUPPLIERS } from '../../suppliers/configurableRegistry'
import {
  CONFIGURABLE_SUPPLIER_KEYS, ConfigurableSupplierKey, SupplierSettings, isSecretSettingKey,
} from '../../suppliers/configurableTypes'

const router = Router()
router.use(requireAdmin)

const supplierKeySchema = z.enum(CONFIGURABLE_SUPPLIER_KEYS)

const putSchema = z.object({
  supplierKey: supplierKeySchema,
  enabled: z.boolean(),
  // Values are all strings — these are credentials and URLs, not structured config. Kept
  // permissive on keys so a supplier can gain a setting without a schema migration; unknown
  // keys are dropped below rather than stored.
  settings: z.record(z.string()).default({}),
})

// Never return a credential the admin UI already has. A secret-shaped key comes back as a
// masked preview (last 4 characters) so the operator can tell "is a key set, and is it the one
// I think it is" without the value ever leaving the server again.
function redactSettings(settings: SupplierSettings): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value !== 'string') continue
    out[key] = isSecretSettingKey(key) ? maskSecret(value) : value
  }
  return out
}

function maskSecret(value: string): string {
  if (value.length === 0) return ''
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

// A masked value coming back on a PUT means "unchanged" — the UI renders the mask in the input,
// and an operator who doesn't touch that field would otherwise overwrite a real key with dots.
function isMaskedValue(value: string): boolean {
  return value.startsWith('••••')
}

// GET /api/admin/store-suppliers
// Every configurable supplier the platform knows about, each annotated with this store's
// enablement state and (redacted) settings. The admin Integrations page renders straight from
// this, so a new supplier appears with no frontend change.
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId
    if (!storeId) throw createError('No store in context', 400, 'NO_STORE')

    const rows = await prisma.storeSupplier.findMany({ where: { storeId } })
    const byKey = new Map(rows.map((r) => [r.supplierKey as string, r]))

    const data = listConfigurableSuppliers().map((meta) => {
      const row = byKey.get(meta.key)
      const settings = (row?.settings ?? {}) as SupplierSettings
      const missingRequired = meta.settingFields
        .filter((f) => f.required && !String(settings[f.name] ?? '').trim())
        .map((f) => f.label)

      return {
        key: meta.key,
        displayName: meta.displayName,
        description: meta.description,
        docsUrl: meta.docsUrl,
        capabilities: meta.capabilities,
        settingFields: meta.settingFields,
        enabled: row?.enabled ?? false,
        configured: missingRequired.length === 0,
        missingRequired,
        settings: redactSettings(settings),
        updatedAt: row?.updatedAt ?? null,
      }
    })

    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// PUT /api/admin/store-suppliers
// Upserts one supplier's enablement + settings for the current store.
router.put('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId
    if (!storeId) throw createError('No store in context', 400, 'NO_STORE')

    const { supplierKey, enabled, settings } = putSchema.parse(req.body)
    const meta = CONFIGURABLE_SUPPLIERS[supplierKey as ConfigurableSupplierKey]

    const existing = await prisma.storeSupplier.findUnique({
      where: { storeId_supplierKey: { storeId, supplierKey } },
    })
    const previous = (existing?.settings ?? {}) as SupplierSettings

    // Only keys this supplier actually declares are stored — stops the settings blob turning
    // into a junk drawer, and means a removed field stops being persisted.
    const allowed = new Set(meta.settingFields.map((f) => f.name))
    const merged: SupplierSettings = { ...previous }
    for (const [key, value] of Object.entries(settings)) {
      if (!allowed.has(key)) continue
      // Masked value = the operator didn't retype the secret; keep what's stored.
      if (isSecretSettingKey(key) && isMaskedValue(value)) continue
      if (value === '') delete merged[key]
      else merged[key] = value
    }

    // Refuse to switch a supplier on while it can't actually place an order — enabling it would
    // route real orders to an adapter that throws on every submission.
    if (enabled) {
      const missing = meta.settingFields.filter((f) => f.required && !String(merged[f.name] ?? '').trim())
      if (missing.length > 0) {
        throw createError(
          `${meta.displayName} can't be enabled yet — fill in: ${missing.map((f) => f.label).join(', ')}.`,
          400,
          'SUPPLIER_NOT_CONFIGURED'
        )
      }
    }

    const saved = await prisma.storeSupplier.upsert({
      where: { storeId_supplierKey: { storeId, supplierKey } },
      create: { storeId, supplierKey, enabled, settings: merged as Prisma.InputJsonValue },
      update: { enabled, settings: merged as Prisma.InputJsonValue },
    })

    res.json({
      success: true,
      data: {
        key: saved.supplierKey,
        enabled: saved.enabled,
        settings: redactSettings(merged),
        updatedAt: saved.updatedAt,
      },
    })
  } catch (err) { next(err) }
})

export default router
