import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RecentProduct {
  productId: string
  slug: string
  title: string
  image: string
  price: number
  compareAtPrice?: number | null
  viewedAt: number
}

interface RecentlyViewedState {
  items: RecentProduct[]
  add: (item: Omit<RecentProduct, 'viewedAt'>) => void
}

const MAX_ITEMS = 12

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const filtered = s.items.filter((i) => i.productId !== item.productId)
          return { items: [{ ...item, viewedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS) }
        }),
    }),
    { name: 'recently-viewed' }
  )
)
