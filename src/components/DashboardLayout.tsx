import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const baseNavItems = [
  { to: '/dashboard', label: 'Home', end: true },
  { to: '/dashboard/links', label: 'Links', end: false },
  { to: '/dashboard/qr', label: 'QR Codes', end: false },
]

const clientsNavItem = { to: '/dashboard/clients', label: 'Clients', end: false }

const trailingNavItems = [
  { to: '/dashboard/domains', label: 'Domains', end: false },
  { to: '/dashboard/settings', label: 'Settings', end: false },
  { to: '/dashboard/billing', label: 'Billing', end: false },
]

export default function DashboardLayout() {
  const { logout, tier } = useAuth()
  const navigate = useNavigate()

  const navItems = [
    ...baseNavItems,
    ...(tier === 'agency' ? [clientsNavItem] : []),
    ...trailingNavItems,
  ]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">Waytrace</span>
            <nav className="flex items-center gap-4 text-sm">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'font-medium text-foreground'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
