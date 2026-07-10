import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Gates routes that only the account owner or an invited admin may access
 * (workspaces, domains, billing, user management). Contributors are bounced
 * back to the dashboard home. Assumes it is nested inside ProtectedRoute, so
 * the principal is already authenticated. The Worker enforces the same gates,
 * so this is UX, not the security boundary.
 */
export function AdminRoute() {
  const { canAdminister } = useAuth()

  if (!canAdminister) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
