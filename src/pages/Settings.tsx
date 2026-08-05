import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { changePassword, changeEmail, cancelEmailChange, getMe, type Me } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'
import { useAuth } from '@/context/AuthContext'

// Internal tier values → the customer-facing plan names used everywhere in the
// UI (matches Billing.tsx). 'agency' is branded "Team".
const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Professional',
  agency: 'Team',
  enterprise: 'Enterprise',
}

export default function Settings() {
  const { replaceSession } = useAuth()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [isSavingEmail, setIsSavingEmail] = useState(false)

  function loadMe() {
    return getMe()
      .then((data) => {
        setMe(data)
        setNewEmail(data.email ?? '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load account'))
  }

  useEffect(() => {
    loadMe()
  }, [])

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailNotice(null)
    setIsSavingEmail(true)
    try {
      const res = await changeEmail(newEmail, emailPassword)
      setEmailPassword('')
      setEmailNotice(
        res.verification_sent
          ? `We sent a confirmation link to ${res.pending_email}. Your current email keeps working until you confirm the new one.`
          : `Email change started for ${res.pending_email}, but the confirmation email could not be sent — contact support.`
      )
      await loadMe()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setIsSavingEmail(false)
    }
  }

  async function handleCancelEmail() {
    setEmailError(null)
    setEmailNotice(null)
    setIsSavingEmail(true)
    try {
      await cancelEmailChange()
      await loadMe()
      setEmailNotice('Pending email change cancelled.')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to cancel email change')
    } finally {
      setIsSavingEmail(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)
    setIsSubmitting(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      replaceSession(result.api_token, result.expires_at)
      setPasswordSuccess(
        `Password updated. ${result.revoked_browser_sessions} other dashboard session${result.revoked_browser_sessions === 1 ? '' : 's'} signed out.`
      )
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Invited Team users (admin or contributor) authenticate with their own per-user
  // token: /me returns no api_token and change-email 403s for them. They still get a
  // working change-password card (their own credential); the owner-only account
  // controls (email, tracking foundation, integrations) are hidden.
  const isInvitedUser = me != null && me.user_id != null
  const pendingEmail = me?.pending_email ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Account" title="Settings" />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow-sm">Name</span>
            <span>{me?.name ?? '—'}</span>
          </div>
          {isInvitedUser && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow-sm">Email</span>
                <span className="mono text-sm">{me?.email ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow-sm">Role</span>
                <Badge variant="default" className="w-fit">
                  {me?.role ?? '—'}
                </Badge>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow-sm">Plan</span>
            <Badge variant={me?.tier === 'free' ? 'secondary' : 'default'} className="w-fit">
              {me ? (TIER_LABELS[me.tier] ?? me.tier) : '—'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {!isInvitedUser && (
      <>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Tracking Foundation</CardTitle>
          <CardDescription>
            The shared sources and mediums your team reuses on every link. Edit them any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/dashboard/settings/tracking-foundation" className={buttonVariants()}>
            Manage tracking foundation
          </Link>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          {/* Keep this list in sync with the Integrations page — add each new
              integration here as it ships (currently: WordPress plugin + GA4). */}
          <CardDescription>
            Install the WordPress plugin and connect Google Analytics to see sessions, key events, and
            revenue alongside your clicks and scans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/dashboard/settings/integrations" className={buttonVariants()}>
            Manage integrations
          </Link>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Used to log in and for billing/receipt emails from Stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeEmail} className="flex flex-col gap-4">
            {emailError && (
              <Alert variant="destructive">
                <AlertDescription>{emailError}</AlertDescription>
              </Alert>
            )}
            {emailNotice && (
              <Alert>
                <AlertDescription>{emailNotice}</AlertDescription>
              </Alert>
            )}
            {pendingEmail && (
              <Alert>
                <AlertDescription className="flex flex-col gap-2">
                  <span>
                    Awaiting confirmation for <span className="font-medium">{pendingEmail}</span>. Check
                    that inbox for the confirmation link — your current email stays active until then.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={isSavingEmail}
                    onClick={handleCancelEmail}
                  >
                    Cancel change
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">New email address</Label>
              <Input
                id="email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email_current_password">Current password</Label>
              <Input
                id="email_current_password"
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Confirm it's you"
              />
            </div>
            <Button
              type="submit"
              disabled={isSavingEmail || !emailPassword || newEmail === (me?.email ?? '')}
              className="w-fit"
            >
              {isSavingEmail ? 'Saving...' : pendingEmail ? 'Resend confirmation' : 'Update email'}
            </Button>
          </form>
        </CardContent>
      </Card>
      </>
      )}

      {/* Change password — every human identity, including invited users (#15). */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            {passwordSuccess && (
              <Alert>
                <AlertDescription>{passwordSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="current_password">Current password</Label>
              <Input
                id="current_password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              {isSubmitting ? 'Saving...' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
