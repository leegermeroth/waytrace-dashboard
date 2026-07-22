import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  loginAccount,
  registerAccount,
  setPassword,
  resetPassword,
  acceptInvite as acceptInviteApi,
  getMe,
  markOnboarded as markOnboardedApi,
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
  /**
   * Platform Admin Console access (accounts.is_platform_admin). Persisted like
   * role so the Platform nav doesn't flash on reload; /me re-syncs it
   * authoritatively on mount. The Worker enforces the real gate.
   */
  isPlatformAdmin: boolean
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean
  /** True for owner or invited admin — anyone who can manage the account. */
  canAdminister: boolean
  isContributor: boolean
  /**
   * True once /me confirms this is the account owner and the one-time onboarding
   * flag is unset. Undefined onboarding state (not yet loaded) reads as false, so
   * the wizard never flashes before /me resolves.
   */
  needsOnboarding: boolean
  /** Stamp the onboarding flag server-side and locally so the wizard won't re-open. */
  markOnboarded: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  completeSetup: (token: string, password: string) => Promise<void>
  completeReset: (token: string, password: string) => Promise<void>
  acceptInvite: (token: string, password: string, name?: string) => Promise<void>
  logout: () => void
}

const STORAGE_KEY = 'waytrace_auth'

const AuthContext = createContext<AuthContextValue | null>(null)

const EMPTY_AUTH: AuthState = {
  apiToken: null,
  tier: null,
  subscriptionStatus: null,
  role: null,
  isPlatformAdmin: false,
}

function loadStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_AUTH
    const parsed = JSON.parse(raw)
    return {
      apiToken: parsed.apiToken ?? null,
      tier: parsed.tier ?? null,
      subscriptionStatus: parsed.subscriptionStatus ?? null,
      role: parsed.role ?? null,
      isPlatformAdmin: parsed.isPlatformAdmin ?? false,
    }
  } catch {
    return EMPTY_AUTH
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadStoredAuth)
  // Onboarding flag is intentionally NOT persisted: undefined = unknown (not yet
  // loaded from /me), string = onboarded, null = never onboarded. Only /me sets it.
  const [onboardedAt, setOnboardedAt] = useState<string | null | undefined>(undefined)

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
      // Auth responses don't carry the platform flag — /me syncs it on mount.
      isPlatformAdmin: false,
    })
  }, [persist])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const result = await registerAccount(email, password, name)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
      isPlatformAdmin: false,
    })
  }, [persist])

  const completeSetup = useCallback(async (token: string, password: string) => {
    const result = await setPassword(token, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
      isPlatformAdmin: false,
    })
  }, [persist])

  const completeReset = useCallback(async (token: string, password: string) => {
    const result = await resetPassword(token, password)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: 'owner',
      isPlatformAdmin: false,
    })
  }, [persist])

  const acceptInvite = useCallback(async (token: string, password: string, name?: string) => {
    const result = await acceptInviteApi(token, password, name)
    persist({
      apiToken: result.api_token,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: result.role ?? 'contributor',
      isPlatformAdmin: false,
    })
  }, [persist])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(EMPTY_AUTH)
    setOnboardedAt(undefined)
  }, [])

  const markOnboarded = useCallback(async () => {
    try {
      const res = await markOnboardedApi()
      setOnboardedAt(res.onboarded_at ?? new Date().toISOString())
    } catch {
      // Even if the stamp call fails, close the wizard locally so it doesn't
      // nag; /me re-syncs the authoritative flag on the next mount.
      setOnboardedAt(new Date().toISOString())
    }
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
        const isPlatformAdmin = me.is_platform_admin === 1
        setOnboardedAt(me.onboarded_at ?? null)
        setAuth((prev) => {
          if (prev.role === role && prev.tier === me.tier && prev.isPlatformAdmin === isPlatformAdmin) return prev
          const next = { ...prev, role, tier: me.tier, isPlatformAdmin }
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

  const needsOnboarding =
    Boolean(auth.apiToken) &&
    effectiveRole === 'owner' &&
    auth.tier !== 'free' &&
    onboardedAt === null

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        role: effectiveRole,
        isAuthenticated: Boolean(auth.apiToken),
        canAdminister: effectiveRole === 'owner' || effectiveRole === 'admin',
        isContributor: effectiveRole === 'contributor',
        needsOnboarding,
        markOnboarded,
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
