import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { isOrgSelection, type OrgMembership } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthLayout } from '@/components/brand'

const ROLE_LABEL: Record<OrgMembership['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  contributor: 'Contributor',
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Where ProtectedRoute sent us from (only ever a same-origin /dashboard path).
  const intended = (location.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // When the same credentials match more than one login, hold the choices here.
  const [memberships, setMemberships] = useState<OrgMembership[] | null>(null)

  function goToDashboard() {
    navigate(intended && intended.startsWith('/dashboard') ? intended : '/dashboard')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await login(email, password)
      if (isOrgSelection(result)) {
        setMemberships(result.memberships)
      } else {
        goToDashboard()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSelect(m: OrgMembership) {
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await login(email, password, { account_id: m.account_id, user_id: m.user_id })
      // A specific selection should always authenticate; guard defensively.
      if (isOrgSelection(result)) {
        setError('That workspace could not be selected. Please try signing in again.')
      } else {
        goToDashboard()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (memberships) {
    return (
      <AuthLayout
        eyebrow="Choose a workspace"
        title="Where to?"
        description="This email can sign in to more than one Waytrace workspace. Choose which one to open."
        footer={
          <button
            type="button"
            onClick={() => { setMemberships(null); setPassword('') }}
            className="font-medium text-ochre hover:text-ochre-hover"
          >
            Use a different account
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {memberships.map((m) => (
            <button
              key={`${m.account_id}:${m.user_id ?? 'owner'}`}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSelect(m)}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-ochre disabled:opacity-60"
            >
              <span className="font-medium">{m.org_name || 'Waytrace workspace'}</span>
              <span className="eyebrow-sm text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            </button>
          ))}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back"
      description="Enter your email and password to reach your dashboard."
      footer={
        <Link to="/forgot-password" className="font-medium text-ochre hover:text-ochre-hover">
          Forgot your password?
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
