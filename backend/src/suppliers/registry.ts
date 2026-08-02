import { SupplierAdapter } from './types'
import { CJAdapter } from './CJAdapter'
import { AliExpressAdapter } from './AliExpressAdapter'
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
