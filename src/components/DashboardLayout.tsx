import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Wordmark } from '@/components/brand'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { cn } from '@/lib/utils'

const baseNavItems = [
  { to: '/dashboard', label: 'Home', end: true },
  { to: '/dashboard/links', label: 'Links', end: false },
  // Analytics is read-only and available to everyone, including contributors.
  { to: '/dashboard/analytics', label: 'Analytics', end: false },
]

const clientsNavItem = { to: '/dashboard/clients', label: 'Workspaces', end: false }

// Enterprise-only: the asset-collection engine's product page. Contributors see
// it too (read-only per existing role rules — the page hides write actions).
const packagingNavItem = { to: '/dashboard/packaging', label: 'Packaging', end: false }

// Settings is visible to everyone; the admin-only items are added conditionally.
const settingsNavItem = { to: '/dashboard/settings', label: 'Settings', end: true }
const usersNavItem = { to: '/dashboard/settings/users', label: 'Users', end: false }
const adminTrailingNavItems = [
  { to: '/dashboard/domains', label: 'Domains', end: false },
  { to: '/dashboard/billing', label: 'Billing', end: false },
]

// Platform Admin Console — rendered as its own labeled section, visible only
// when the login's account has is_platform_admin = 1.
const platformNavItems = [
  { to: '/dashboard/platform/provision', label: 'Provision', end: false },
  { to: '/dashboard/platform/accounts', label: 'Accounts', end: false },
  { to: '/dashboard/platform/stats', label: 'Stats', end: false },
]

type NavItem = { to: string; label: string; end: boolean }

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center border-l-2 py-2 pl-4 pr-3 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors',
          isActive
            ? 'border-ochre bg-accent/70 text-foreground'
            : 'border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
        )
      }
    >
      {item.label}
    </NavLink>
  )
}

function TopNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'whitespace-nowrap border-b-2 pb-1 font-mono text-[0.6875rem] tracking-[0.1em] uppercase transition-colors',
          isActive
            ? 'border-ochre text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )
      }
    >
      {item.label}
    </NavLink>
  )
}

export default function DashboardLayout() {
  const { logout, tier, canAdminister, isPlatformAdmin, isEnterprise } = useAuth()
  const navigate = useNavigate()

  const navItems: NavItem[] = [
    ...baseNavItems,
    ...(isEnterprise ? [packagingNavItem] : []),
    // Workspaces is a Team feature and a management surface — owner/admin only.
    // Enterprise accounts have multi-workspace caps too.
    ...((tier === 'agency' || isEnterprise) && canAdminister ? [clientsNavItem] : []),
    settingsNavItem,
    ...(canAdminister ? [usersNavItem, ...adminTrailingNavItems] : []),
  ]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-svh md:flex">
      {/* One-time guided setup — self-gates on needsOnboarding (owner, first login). */}
      <OnboardingWizard />

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-[72px] items-center border-b border-border px-5">
          <NavLink to="/dashboard" aria-label="Waytrace home">
            <Wordmark markSize={24} />
          </NavLink>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 py-4">
          {navItems.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          {isPlatformAdmin && (
            <>
              <div className="eyebrow-sm mt-5 mb-1 px-4">Platform</div>
              {platformNavItems.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-border p-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-md border border-foreground/20 px-3 py-2 text-left font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:border-foreground/35 hover:text-foreground"
          >
            Log out
          </button>
          <div className="eyebrow-sm mt-4 px-1">Growth starts before the click.</div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_oklch,var(--background),transparent_14%)] backdrop-blur-md md:hidden">
        <div className="flex h-[64px] items-center justify-between px-5">
          <NavLink to="/dashboard" aria-label="Waytrace home">
            <Wordmark markSize={22} />
          </NavLink>
          <button
            onClick={handleLogout}
            className="rounded-md border border-foreground/20 px-3 py-1.5 font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:border-foreground/35 hover:text-foreground"
          >
            Log out
          </button>
        </div>
        <nav className="flex items-center gap-5 overflow-x-auto border-t border-border px-5 py-3">
          {navItems.map((item) => (
            <TopNavLink key={item.to} item={item} />
          ))}
          {isPlatformAdmin &&
            platformNavItems.map((item) => <TopNavLink key={item.to} item={item} />)}
        </nav>
      </header>

      {/* Main content */}
      <div className="flex-1 md:pl-60">
        <main className="dot-grid min-h-svh">
          <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
