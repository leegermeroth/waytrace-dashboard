import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  loginAccount,
  registerAccount,
  setPassword,
  resetPassword,
  acceptInvite as acceptInviteApi,
  getMe,
} from '@/lib/api'

/**
 * The authenticated principal's role:
 *  - 'owner'       — the account holder (accounts row, full admin)
 *  - 'admin'       — an invited Team user with role='admin' (full admin)
 *  - 'contributor' — an invited Team user, reduced capabilities
 * Owner and admin share the same capabilities in the UI.
 */
export type Role = 'owner' | 'admin' | 'contributor'

interface AuthState {
  apiToken: string | null
  tier: string | null
  subscriptionStatus: string | null
  role: Role | null
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean
  /** True for owner or invited admin — anyone who can manage the account. */
  canAdminister: boolean
  isContributor: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  completeSetup: (token: string, password: string) => Promise<void>
  completeReset: (token: string, password: string) => Promise<void>
  acceptInvite: (token: string, password: string, name?: string) => Promise<void>
  logout: () => void
}

const STORAGE_KEY = 'waytrace_auth'

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { apiToken: null, tier: null, subscriptionStatus: null, role: null }
    const parsed = JSON.parse(raw)
    return {
      apiToken: parsed.apiToken ?? null,
      tier: parsed.tier ?? null,
      subscriptionStatus: parsed.subscriptionStatus ?? null,
      role: parsed.role ?? null,
    }
  } catch {
    return { apiToken: null, tier: null, subscriptionStatus: null, role: null }
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
      // The Worker only returns `role` for invited Team users; an account owner
      // gets no role field and is treated as full admin.
      role: result.role ?? 'owner',
    })
  }, [persist])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const result = await registerAccount(email, password, name)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
    })
  }, [persist])

  const completeSetup = useCallback(async (token: string, password: string) => {
    const result = await setPassword(token, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
    })
  }, [persist])

  const completeReset = useCallback(async (token: string, password: string) => {
    const result = await resetPassword(token, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
    })
  }, [persist])

  const acceptInvite = useCallback(async (token: string, password: string, name?: string) => {
    const result = await acceptInviteApi(token, password, name)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: result.role ?? 'contributor',
    })
  }, [persist])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth({ apiToken: null, tier: null, subscriptionStatus: null, role: null })
  }, [])

  // Re-hydrate role/tier authoritatively from /me on mount. localStorage gives
  // an instant (possibly stale) value so the role-gated UI doesn't flash; this
  // corrects it — e.g. an admin was demoted to contributor server-side, or a
  // pre-existing owner session was stored before roles existed.
  useEffect(() => {
    if (!auth.apiToken) return
    let cancelled = false
    getMe()
      .then((me) => {
        if (cancelled) return
        const role: Role = me.role ?? 'owner'
        setAuth((prev) => {
          if (prev.role === role && prev.tier === me.tier) return prev
          const next = { ...prev, role, tier: me.tier }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      })
      .catch(() => {
        // Ignore — a failed /me shouldn't log the user out here.
      })
    return () => {
      cancelled = true
    }
    // Only on mount / when the token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.apiToken])

  const effectiveRole: Role | null = auth.apiToken ? auth.role ?? 'owner' : null

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        role: effectiveRole,
        isAuthenticated: Boolean(auth.apiToken),
        canAdminister: effectiveRole === 'owner' || effectiveRole === 'admin',
        isContributor: effectiveRole === 'contributor',
        login,
        register,
        completeSetup,
        completeReset,
        acceptInvite,
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
