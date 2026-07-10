import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthLayout } from '@/components/brand'
import { resendSetupEmail } from '@/lib/api'

export default function CheckEmail() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!sessionId) return
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await resendSetupEmail(sessionId, email || undefined)
      setSentTo(result.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend the setup email')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Subscription confirmed"
      title="Check your email"
      description="We sent you a link to set your password — it should arrive within a minute or two."
      footer={
        <>
          Already set your password?{' '}
          <Link to="/login" className="font-medium text-ochre hover:text-ochre-hover">
            Log in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-muted-foreground">
        <p>
          Can't find it? Check your spam folder. The email comes from{' '}
          <span className="mono text-foreground">hello@waytrace.co</span>.
        </p>

        {sessionId && (
          <div className="dot-grid-well flex flex-col gap-3 rounded-md border border-border p-4 text-left">
            {sentTo ? (
              <Alert>
                <AlertDescription>Sent a new setup link to {sentTo}.</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-foreground">Typo'd your email, or nothing showing up?</p>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                  <Label htmlFor="resend-email">Correct email (leave blank to just resend)</Label>
                  <Input
                    id="resend-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    className="mt-1 w-fit"
                  >
                    {isSubmitting ? 'Sending…' : 'Resend setup link'}
                  </Button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
