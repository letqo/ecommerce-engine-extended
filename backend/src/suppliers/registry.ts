import { SupplierAdapter } from './types'
import { CJAdapter } from './CJAdapter'
import { AliExpressAdapter } from './AliExpressAdapter'
import { PrintfulAdapter } from './PrintfulAdapter'
import { GelatoAdapter } from './GelatoAdapter'
import { BigBuyAdapter } from './BigBuyAdapter'
import { WooBridgeAdapter } from './WooBridgeAdapter'
import { SupplierSettings, ConfigurableSupplierKey } from './configurableTypes'
import { env } from '../config/env'

const adapters = new Map<string, SupplierAdapter>()

const cj = new CJAdapter()
adapters.set('cj', cj)

if (env.ALIEXPRESS_APP_KEY) {
  adapters.set('aliexpress', new AliExpressAdapter())
}

export function getAdapter(name: string): SupplierAdapter {
  const adapter = adapters.get(name)
  if (!adapter) throw new Error(`No supplier adapter registered for: ${name}`)
  return adapter
}

export function getDefaultAdapter(): SupplierAdapter {
  return cj
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys())
}

// Returns a fresh, unshared adapter instance — use whenever the caller needs
// to scope the adapter to a specific store (withStore). The registry's
// getAdapter() singletons are reused across every request, so mutating their
// storeId is unsafe under concurrent requests from different stores.
export function createAdapter(name: string): SupplierAdapter {
  if (!adapters.has(name)) throw new Error(`No supplier adapter registered for: ${name}`)
  if (name === 'cj') return new CJAdapter()
  if (name === 'aliexpress') return new AliExpressAdapter()
  throw new Error(`No supplier adapter registered for: ${name}`)
}

// ---- Configurable (per-store) suppliers ------------------------------------------------
//
// Everything above is a process-wide singleton reading credentials from env — correct for CJ
// and AliExpress, which are one shared business account across the whole deployment.
//
// Suppliers added after them are configured PER STORE (StoreSupplier.settings), so there is no
// singleton to hand out: the caller passes the store's settings and gets a freshly configured
// adapter back. Never cache the result across stores.
//
// Throws SupplierConfigError (from configurableTypes) when a required setting is missing — the
// message names the field and points at Admin → Integrations.
export function getConfigurableAdapter(key: ConfigurableSupplierKey, config: SupplierSettings): SupplierAdapter {
  switch (key) {
    case 'PRINTFUL':
      return new PrintfulAdapter(config)
    case 'GELATO':
      return new GelatoAdapter(config)
    case 'BIGBUY':
      return new BigBuyAdapter(config)
    case 'WOO_BRIDGE':
      return new WooBridgeAdapter(config)
    default: {
      // Exhaustiveness guard — adding a key to ConfigurableSupplierKey without a case here
      // becomes a compile error rather than a runtime surprise.
      const never: never = key
      throw new Error(`No configurable supplier adapter for: ${never}`)
    }
  }
}
