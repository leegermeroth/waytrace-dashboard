import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { loginAccount, registerAccount, setPassword } from '@/lib/api'

interface AuthState {
  apiToken: string | null
  tier: string | null
  subscriptionStatus: string | null
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  completeSetup: (token: string, password: string) => Promise<void>
  logout: () => void
}

const STORAGE_KEY = 'waytrace_auth'

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { apiToken: null, tier: null, subscriptionStatus: null }
    return JSON.parse(raw)
  } catch {
    return { apiToken: null, tier: null, subscriptionStatus: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadStoredAuth)

  const persist = useCallback((next: AuthState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setAuth(next)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginAccount(email, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
    })
  }, [persist])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const result = await registerAccount(email, password, name)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
    })
  }, [persist])

  const completeSetup = useCallback(async (token: string, password: string) => {
    const result = await setPassword(token, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
    })
  }, [persist])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth({ apiToken: null, tier: null, subscriptionStatus: null })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        isAuthenticated: Boolean(auth.apiToken),
        login,
        register,
        completeSetup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
