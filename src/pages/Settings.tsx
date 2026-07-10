import { useEffect, useState, type FormEvent } from 'react'
import { changePassword, changeEmail, getMe, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [isSavingEmail, setIsSavingEmail] = useState(false)

  useEffect(() => {
    getMe()
      .then((data) => {
        setMe(data)
        setNewEmail(data.email ?? '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load account'))
  }, [])

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailSuccess(false)
    setIsSavingEmail(true)
    try {
      const updated = await changeEmail(newEmail)
      setMe(updated)
      setEmailSuccess(true)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setIsSavingEmail(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    setIsSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCopyToken() {
    if (!me?.api_token) return
    await navigator.clipboard.writeText(me.api_token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Invited Team users (admin or contributor) authenticate with their own
  // per-user token: /me returns no api_token, and change-email/change-password
  // 403 for them. Show them a reduced, read-only account view instead of forms
  // that would just error.
  const isInvitedUser = me != null && me.user_id != null

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
              {me?.tier ?? '—'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {!isInvitedUser && (
      <>
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
            {emailSuccess && (
              <Alert>
                <AlertDescription>Email updated.</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={isSavingEmail || newEmail === (me?.email ?? '')}
              className="w-fit"
            >
              {isSavingEmail ? 'Saving...' : 'Update email'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
                <AlertDescription>Password updated.</AlertDescription>
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
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              {isSubmitting ? 'Saving...' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>API token</CardTitle>
          <CardDescription>
            Used by the WordPress plugin and direct API access. Keep this secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input readOnly value={me?.api_token ?? ''} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={handleCopyToken}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
