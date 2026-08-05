import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmailChange } from '@/lib/api'
import { AuthLayout } from '@/components/brand'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Status = 'verifying' | 'done' | 'error'

export default function VerifyEmailChange() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(
    token ? null : 'This confirmation link is missing its token. Please use the link from your email.'
  )
  // StrictMode double-invokes effects in dev; the token is single-use, so guard it.
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    verifyEmailChange(token)
      .then((res) => {
        setEmail(res.email)
        setStatus('done')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not confirm your new email')
        setStatus('error')
      })
  }, [token])

  if (status === 'done') {
    return (
      <AuthLayout
        eyebrow="Account security"
        title="Email confirmed"
        description={
          <>
            Your Waytrace sign-in email is now{' '}
            <span className="font-medium text-foreground">{email}</span>. Use it next time you log in.
          </>
        }
        footer={
          <Link to="/login" className="font-medium text-ochre hover:text-ochre-hover">
            Continue to sign in
          </Link>
        }
      >
        <div />
      </AuthLayout>
    )
  }

  if (status === 'error') {
    return (
      <AuthLayout
        eyebrow="Account security"
        title="Couldn't confirm this email"
        description="The confirmation link may have expired or already been used."
        footer={
          <Link to="/login" className="font-medium text-ochre hover:text-ochre-hover">
            Back to sign in
          </Link>
        }
      >
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Account security"
      title="Confirming your email…"
      description="One moment while we confirm your new address."
    >
      <div />
    </AuthLayout>
  )
}
