import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'
import DashboardLayout from '@/components/DashboardLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Welcome from '@/pages/Welcome'
import AcceptInvite from '@/pages/AcceptInvite'
import CheckEmail from '@/pages/CheckEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Terms from '@/pages/Terms'
import Privacy from '@/pages/Privacy'
import Dashboard from '@/pages/Dashboard'
import LinksList from '@/pages/LinksList'
import LinkForm from '@/pages/LinkForm'
import LinkDetail from '@/pages/LinkDetail'
import Analytics from '@/pages/Analytics'
import Clients from '@/pages/Clients'
import Settings from '@/pages/Settings'
import Users from '@/pages/Users'
import Billing from '@/pages/Billing'
import Domains from '@/pages/Domains'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/links" element={<LinksList />} />
              {/* Analytics is read-only — available to contributors too (no AdminRoute). */}
              <Route path="/dashboard/analytics" element={<Analytics />} />
              <Route path="/dashboard/links/new" element={<LinkForm />} />
              <Route path="/dashboard/links/:id" element={<LinkDetail />} />
              <Route path="/dashboard/links/:id/edit" element={<LinkForm />} />
              <Route path="/dashboard/settings" element={<Settings />} />
              {/* Owner/admin only — contributors are redirected to /dashboard. */}
              <Route element={<AdminRoute />}>
                <Route path="/dashboard/clients" element={<Clients />} />
                <Route path="/dashboard/settings/users" element={<Users />} />
                <Route path="/dashboard/billing" element={<Billing />} />
                <Route path="/dashboard/domains" element={<Domains />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
