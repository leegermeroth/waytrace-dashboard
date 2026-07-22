import { useState, type FormEvent } from 'react'
import { provisionEnterpriseAccount, type ProvisionedAccount } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/brand'

export default function PlatformProvision() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [maxClients, setMaxClients] = useState('10')
  // Display-only scratch field for the agreed price — intentionally NOT sent or
  // stored anywhere; the source of truth for pricing is the Stripe subscription.
  const [priceNote, setPriceNote] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ProvisionedAccount | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCreated(null)

    const limit = Number(maxClients)
    if (!Number.isInteger(limit) || limit < 1) {
      setError('Workspace limit must be a positive whole number.')
      return
    }

    setIsSubmitting(true)
    try {
      const account = await provisionEnterpriseAccount({
        name: name.trim(),
        email: email.trim(),
        max_clients: limit,
      })
      setCreated(account)
      setName('')
      setEmail('')
      setMaxClients('10')
      setPriceNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision account')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Platform"
        title="Provision Enterprise"
        description="Create an Enterprise account and send the set-your-password email. Then create the matching Customer + Subscription in Stripe (custom price) — the webhook syncs status automatically."
      />

      {created && (
        <Alert>
          <AlertDescription>
            <strong>{created.name}</strong> provisioned as Enterprise (account #{created.id}, up to{' '}
            {created.max_clients} workspaces).{' '}
            {created.email_sent
              ? `Setup email sent to ${created.email}.`
              : `Setup email could NOT be sent (email service not configured) — resend manually.`}{' '}
            Next: create the Stripe Customer for {created.email} with the agreed price.
          </AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New Enterprise account</CardTitle>
          <CardDescription>
            The account is created with tier Enterprise, unlimited branded domains and team seats,
            and the workspace limit you set here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="prov_name">Company</Label>
                <Input
                  id="prov_name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Painterland Sisters LLC"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prov_email">Email</Label>
                <Input
                  id="prov_email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ops@company.com"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="prov_max_clients">Workspace limit</Label>
                <Input
                  id="prov_max_clients"
                  type="number"
                  min={1}
                  required
                  value={maxClients}
                  onChange={(e) => setMaxClients(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prov_price_note">Agreed price (note only)</Label>
                <Input
                  id="prov_price_note"
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="e.g. $299/mo, Net-30"
                />
                <p className="text-xs text-muted-foreground">
                  Not stored — pricing lives on the Stripe subscription you create next.
                </p>
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              {isSubmitting ? 'Provisioning...' : 'Provision account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
