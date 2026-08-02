import { create } from 'zustand'
import { api } from '@/lib/api'

interface Admin {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

interface AuthState {
  admin: Admin | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  admin: null,
  token: localStorage.getItem('admin_token'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/api/admin/auth/login', { email, password })
      const { token, admin } = res.data.data
      localStorage.setItem('admin_token', token)
      set({ token, admin, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: () => {
    localStorage.removeItem('admin_token')
    set({ admin: null, token: null })
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/api/admin/auth/me')
      set({ admin: res.data.data })
    } catch {
      localStorage.removeItem('admin_token')
      set({ admin: null, token: null })
    }
  },
}))
