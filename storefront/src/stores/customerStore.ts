import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

interface Customer {
  id: string
  email: string
  firstName: string
  lastName: string
}

interface CustomerState {
  customer: Customer | null
  token: string | null
  hydrated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customer: null,
      token: null,
      hydrated: false,
      login: async (email, password) => {
        const res = await api.post<{ success: boolean; data: { token: string; customer: Customer } }>(
          '/store/auth/login',
          { email, password }
        )
        localStorage.setItem('customer_token', res.data.token)
        set({ customer: res.data.customer, token: res.data.token })
      },
      logout: () => {
        localStorage.removeItem('customer_token')
        set({ customer: null, token: null })
      },
      fetchMe: async () => {
        try {
          const res = await api.get<{ success: boolean; data: Customer }>('/store/auth/me')
          set({ customer: res.data })
        } catch {
          get().logout()
        }
      },
    }),
    {
      name: 'customer',
      partialize: (state) => ({ customer: state.customer, token: state.token }),
      onRehydrateStorage: () => () => {
        useCustomerStore.setState({ hydrated: true })
      },
    }
  )
)
