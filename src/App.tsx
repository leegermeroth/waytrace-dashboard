import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import DashboardLayout from '@/components/DashboardLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Welcome from '@/pages/Welcome'
import CheckEmail from '@/pages/CheckEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import LinksList from '@/pages/LinksList'
import LinkForm from '@/pages/LinkForm'
import LinkDetail from '@/pages/LinkDetail'
import QrCodePage from '@/pages/QrCode'
import Clients from '@/pages/Clients'
import Settings from '@/pages/Settings'
import Billing from '@/pages/Billing'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/links" element={<LinksList />} />
              <Route path="/dashboard/links/new" element={<LinkForm />} />
              <Route path="/dashboard/links/:id" element={<LinkDetail />} />
              <Route path="/dashboard/links/:id/edit" element={<LinkForm />} />
              <Route path="/dashboard/qr" element={<QrCodePage />} />
              <Route path="/dashboard/clients" element={<Clients />} />
              <Route path="/dashboard/settings" element={<Settings />} />
              <Route path="/dashboard/billing" element={<Billing />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
