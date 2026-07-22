import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Gates the Platform Admin Console (/dashboard/platform/*) — visible only to
 * logins whose account has is_platform_admin = 1. Assumes it is nested inside
 * ProtectedRoute, so the principal is already authenticated. The Worker
 * enforces the same gate on every /api/v1/admin/* route, so this is UX, not
 * the security boundary.
 */
export function PlatformRoute() {
  const { isPlatformAdmin } = useAuth()

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
