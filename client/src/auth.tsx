import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken } from './lib/api'
import type { Me } from './lib/types'

interface AuthValue {
  me: Me | undefined
  isLoading: boolean
  signedIn: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [token, setTokenState] = useState(getToken)
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), enabled: !!token })

  const value: AuthValue = {
    me: meQuery.data,
    isLoading: !!token && meQuery.isLoading,
    signedIn: !!token,
    async login(email, password) {
      const { token } = await api<{ token: string }>('/auth/login', { body: { email, password } })
      setToken(token)
      qc.clear()
      setTokenState(token)
    },
    logout() {
      setToken(null)
      qc.clear()
      setTokenState(null)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
