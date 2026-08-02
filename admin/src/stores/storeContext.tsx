import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from '@/lib/api'

export interface StoreInfo {
  id: string
  name: string
  currency: string
  shipToCountry: string
}

interface StoreContextValue {
  stores: StoreInfo[]
  activeStore: StoreInfo | null
  switchStore: (storeId: string) => void
  refreshStores: () => Promise<void>
}

const StoreContext = createContext<StoreContextValue>({
  stores: [],
  activeStore: null,
  switchStore: () => {},
  refreshStores: async () => {},
})

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [activeStore, setActiveStore] = useState<StoreInfo | null>(null)

  const refreshStores = async () => {
    try {
      const res = await api.get('/api/admin/store/all')
      const list: StoreInfo[] = res.data.data
      setStores(list)

      const savedId = localStorage.getItem('active_store_id')
      const active = list.find((s) => s.id === savedId) ?? list[0] ?? null
      setActiveStore(active)
      if (active) localStorage.setItem('active_store_id', active.id)
    } catch {}
  }

  const switchStore = (storeId: string) => {
    const store = stores.find((s) => s.id === storeId)
    if (!store) return
    localStorage.setItem('active_store_id', storeId)
    setActiveStore(store)
    // Reload the page so all data re-fetches with the new store context
    window.location.reload()
  }

  useEffect(() => {
    refreshStores()
  }, [])

  return (
    <StoreContext.Provider value={{ stores, activeStore, switchStore, refreshStores }}>
      {children}
    </StoreContext.Provider>
  )
}

export const useStoreContext = () => useContext(StoreContext)
