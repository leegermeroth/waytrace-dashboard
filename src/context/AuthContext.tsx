import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  loginAccount,
  registerAccount,
  setPassword,
  resetPassword,
  acceptInvite as acceptInviteApi,
  getMe,
  markOnboarded as markOnboardedApi,
  ApiError,
} from '@/lib/api'
import { onUnauthorized } from '@/lib/session'

/**
 * Auth lifecycle (#33). Protected content renders only once identity is
 * validated — never on the mere presence of a stored token.
 *  - 'checking'      — a token exists but /me has not yet confirmed it.
 *  - 'authenticated' — /me (or a fresh sign-in) confirmed the session.
 *  - 'anonymous'     — no session; ProtectedRoute sends the user to /login.
 */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

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
  sessionExpiresAt: string | null
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
  /** Auth lifecycle state — ProtectedRoute gates rendering on this. */
  status: AuthStatus
  isAuthenticated: boolean
  /** True for owner or invited admin — anyone who can manage the account. */
  canAdminister: boolean
  isContributor: boolean
  /**
   * Enterprise tier (admin-provisioned, never via Stripe checkout). Gates the
   * Packaging (and later Team Cards) nav + pages. The Worker enforces the real
   * gate on every /api/v1/collections* call.
   */
  isEnterprise: boolean
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
  replaceSession: (apiToken: string, expiresAt: string) => void
  logout: () => void
}

const STORAGE_KEY = 'waytrace_auth'

const AuthContext = createContext<AuthContextValue | null>(null)

const EMPTY_AUTH: AuthState = {
  apiToken: null,
  sessionExpiresAt: null,
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
      sessionExpiresAt: parsed.sessionExpiresAt ?? null,
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
  // A stored token starts as 'checking' — it must be validated by /me before any
  // protected content renders. No token → 'anonymous'. A fresh sign-in sets
  // 'authenticated' directly (its auth response already validated the credential).
  const [status, setStatus] = useState<AuthStatus>(() =>
    loadStoredAuth().apiToken ? 'checking' : 'anonymous'
  )
  // Onboarding flag is intentionally NOT persisted: undefined = unknown (not yet
  // loaded from /me), string = onboarded, null = never onboarded. Only /me sets it.
  const [onboardedAt, setOnboardedAt] = useState<string | null | undefined>(undefined)

  const persist = useCallback((next: AuthState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setAuth(next)
    setStatus('authenticated')
  }, [])

  // Central session teardown: drop stored credentials and fall to 'anonymous'.
  // Used by logout, by a failed identity check, and by the API client's 401 hook.
  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(EMPTY_AUTH)
    setOnboardedAt(undefined)
    setStatus('anonymous')
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginAccount(email, password)
    persist({
      apiToken: result.api_token,
      sessionExpiresAt: result.expires_at ?? null,
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
      sessionExpiresAt: result.expires_at ?? null,
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
      sessionExpiresAt: result.expires_at ?? null,
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
      sessionExpiresAt: result.expires_at ?? null,
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
      sessionExpiresAt: result.expires_at ?? null,
      tier: result.tier,
      subscriptionStatus: result.subscription_status,
      role: result.role ?? 'contributor',
      isPlatformAdmin: false,
    })
  }, [persist])

  const logout = clearSession

  const replaceSession = useCallback((apiToken: string, expiresAt: string) => {
    setAuth((prev) => {
      const next = { ...prev, apiToken, sessionExpiresAt: expiresAt }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
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

  // Any token-bearing 401 the API client sees mid-session (revoked/expired/
  // deactivated credential) invalidates the session centrally.
  useEffect(() => onUnauthorized(clearSession), [clearSession])

  // Validate the stored token with /me before rendering protected content, and
  // re-hydrate role/tier/platform authoritatively. A failed identity check is no
  // longer swallowed: a 401/403 clears the session (a revoked/expired/deactivated
  // token can never leave the user in a protected shell), and a transient
  // network/5xx error drops to 'anonymous' without discarding the token, so a
  // reload or recovered server can re-validate.
  useEffect(() => {
    if (!auth.apiToken) {
      setStatus('anonymous')
      return
    }
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
        setStatus('authenticated')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Definitive: the credential is no longer valid — clear it.
          clearSession()
        } else {
          // Transient (network / 5xx). Don't render protected content without a
          // successful /me, but keep the token so a retry/reload can re-validate.
          setStatus('anonymous')
        }
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
        status,
        role: effectiveRole,
        // Derived from the validated lifecycle — never from a bare stored token.
        isAuthenticated: status === 'authenticated',
        canAdminister: effectiveRole === 'owner' || effectiveRole === 'admin',
        isContributor: effectiveRole === 'contributor',
        isEnterprise: auth.tier === 'enterprise',
        needsOnboarding,
        markOnboarded,
        login,
        register,
        completeSetup,
        completeReset,
        acceptInvite,
        replaceSession,
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
