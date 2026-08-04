import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Gates all /dashboard/* routes on the validated auth lifecycle (#33), not on
 * the mere presence of a stored token:
 *  - 'checking'      — show a loader while /me confirms the token.
 *  - 'anonymous'     — redirect to /login, carrying the intended /dashboard path
 *                      so the user lands back where they were after signing in.
 *  - 'authenticated' — render the protected shell.
 */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          aria-hidden="true"
        />
        <span className="sr-only">Checking your session…</span>
      </div>
    )
  }

  if (status === 'anonymous') {
    // Preserve only a same-origin /dashboard destination (no open redirect).
    const intended = location.pathname.startsWith('/dashboard')
      ? location.pathname + location.search
      : undefined
    return <Navigate to="/login" replace state={intended ? { from: intended } : undefined} />
  }

  return <Outlet />
}
