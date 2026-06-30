import { useEffect, useState } from 'react'
import { createCheckoutSession, createPortalSession, getMe, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Stripe Price IDs — created in the sandbox account via the Stripe API.
// Swap these for the live-mode equivalents once the product goes live.
const PLANS = [
  {
    tier: 'pro',
    label: 'Pro',
    monthly: { priceId: 'price_1Tn4TYBG3tUOcn2lzfPxuTrd', price: '$9/mo' },
    annual: { priceId: 'price_1Tn4TYBG3tUOcn2lB33ZaAg7', price: '$95/yr' },
  },
  {
    tier: 'agency',
    label: 'Agency',
    monthly: { priceId: 'price_1Tn4TZBG3tUOcn2luBta64WP', price: '$25/mo' },
    annual: { priceId: 'price_1Tn4TZBG3tUOcn2lP5vl3huq', price: '$245/yr' },
  },
]

function statusVariant(status: string | undefined): 'default' | 'secondary' | 'destructive' {
  if (status === 'active' || status === 'trialing') return 'default'
  if (status === 'cancelled' || status === 'unpaid') return 'destructive'
  return 'secondary'
}

export default function Billing() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    load()
  }, [])

  function load() {
    getMe()
      .then(setMe)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing info'))
  }

  async function handleUpgrade(priceId: string) {
    setError(null)
    setPendingAction(priceId)
    try {
      const { url } = await createCheckoutSession(priceId)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setPendingAction(null)
    }
  }

  async function handleManageBilling() {
    setError(null)
    setPendingAction('portal')
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal')
      setPendingAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge className="capitalize">{me?.tier ?? '—'}</Badge>
          <Badge variant={statusVariant(me?.subscription_status)} className="capitalize">
            {me?.subscription_status ?? '—'}
          </Badge>
        </CardContent>
        {me?.stripe_customer_id && (
          <CardFooter>
            <Button variant="outline" disabled={pendingAction === 'portal'} onClick={handleManageBilling}>
              {pendingAction === 'portal' ? 'Opening...' : 'Manage billing'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className="flex max-w-xl items-center gap-2">
        <span className="text-sm text-muted-foreground">Billing interval:</span>
        <Select value={interval} onValueChange={(v) => setInterval((v as 'monthly' | 'annual') ?? 'monthly')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => {
          const selected = plan[interval]
          return (
            <Card key={plan.tier}>
              <CardHeader>
                <CardTitle className="capitalize">{plan.label}</CardTitle>
                <CardDescription>{selected.price}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={me?.tier === plan.tier || pendingAction === selected.priceId}
                  onClick={() => handleUpgrade(selected.priceId)}
                >
                  {me?.tier === plan.tier
                    ? 'Current plan'
                    : pendingAction === selected.priceId
                      ? 'Redirecting...'
                      : `Upgrade to ${plan.label}`}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
