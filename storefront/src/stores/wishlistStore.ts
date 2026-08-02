import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WishlistItem {
  productId: string
  slug: string
  title: string
  image: string
  price: number
  compareAtPrice?: number | null
  addedAt: number
}

interface WishlistState {
  items: WishlistItem[]
  add: (item: Omit<WishlistItem, 'addedAt'>) => void
  remove: (productId: string) => void
  has: (productId: string) => boolean
  clear: () => void
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => {
          if (s.items.some((i) => i.productId === item.productId)) return s
          return { items: [...s.items, { ...item, addedAt: Date.now() }] }
        }),
      remove: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      has: (productId) => get().items.some((i) => i.productId === productId),
      clear: () => set({ items: [] }),
    }),
    { name: 'wishlist' }
  )
)
