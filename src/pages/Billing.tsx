import { useEffect, useState } from 'react'
import { cancelSubscription, createCheckoutSession, createPortalSession, getMe, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const REFUND_WINDOW_DAYS = 14

function withinRefundWindow(subscriptionStartedAt: string | null | undefined): boolean {
  if (!subscriptionStartedAt) return false
  const startedAt = new Date(subscriptionStartedAt).getTime()
  return Date.now() - startedAt <= REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

// Live-mode Stripe Price IDs — must stay in sync with PRICE_TIER_MAP in
// link-manager-worker/src/routes/stripe.ts.
const PLANS = [
  {
    tier: 'pro',
    label: 'Professional',
    monthly: { priceId: 'price_1Toqc1Pff1p1MFpE2dEogzWq', price: '$12/mo' },
    annual: { priceId: 'price_1Toqc0Pff1p1MFpEtDcKoP3F', price: '$95/yr' },
  },
  {
    tier: 'agency',
    label: 'Team',
    monthly: { priceId: 'price_1ToqbwPff1p1MFpEmLTk2Zxm', price: '$45/mo' },
    annual: { priceId: 'price_1ToqbvPff1p1MFpERTomCFrQ', price: '$395/yr' },
  },
]

const TIER_LABELS: Record<string, string> = {
  free: 'Free Builder',
  pro: 'Professional',
  agency: 'Team',
}

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

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelConfirmText, setCancelConfirmText] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<string | null>(null)

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

  async function handleCancel() {
    setError(null)
    setIsCancelling(true)
    try {
      const result = await cancelSubscription()
      setCancelResult(
        result.effective === 'immediate'
          ? `Subscription cancelled${result.refunded ? ' and refunded' : ''}. Your workspaces, links, and click history have been permanently deleted.`
          : "Subscription will cancel at the end of your current billing period. You'll keep full access until then, and your data stays intact — no refund is issued for cancellations after the 14-day window."
      )
      setCancelDialogOpen(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription')
    } finally {
      setIsCancelling(false)
    }
  }

  const inWindow = withinRefundWindow(me?.subscription_started_at)

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
          <Badge className="capitalize">{me?.tier ? (TIER_LABELS[me.tier] ?? me.tier) : '—'}</Badge>
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
          const isCurrentPrice = me?.stripe_price_id === selected.priceId
          const isCurrentTierOtherInterval = me?.tier === plan.tier && !isCurrentPrice
          return (
            <Card key={plan.tier}>
              <CardHeader>
                <CardTitle className="capitalize">{plan.label}</CardTitle>
                <CardDescription>{selected.price}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={isCurrentPrice || pendingAction === selected.priceId}
                  onClick={() => handleUpgrade(selected.priceId)}
                >
                  {isCurrentPrice
                    ? 'Current plan'
                    : pendingAction === selected.priceId
                      ? 'Redirecting...'
                      : isCurrentTierOtherInterval
                        ? `Switch to ${interval === 'annual' ? 'annual' : 'monthly'} billing`
                        : `Upgrade to ${plan.label}`}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {me?.stripe_subscription_id && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Cancel subscription</CardTitle>
            <CardDescription>
              {inWindow
                ? `You're within the ${REFUND_WINDOW_DAYS}-day refund window. Cancelling now refunds your payment in full and immediately, permanently deletes all your workspaces, links, and click history.`
                : "You're past the refund window. Cancelling stops future billing at the end of your current period — your data is not deleted and existing links keep working."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cancelResult && (
              <Alert>
                <AlertDescription>{cancelResult}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="destructive" onClick={() => setCancelDialogOpen(true)}>
              Cancel subscription
            </Button>
          </CardFooter>
        </Card>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={(open) => { setCancelDialogOpen(open); if (!open) setCancelConfirmText('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your subscription?</DialogTitle>
            <DialogDescription>
              {inWindow
                ? 'This immediately cancels your subscription, refunds your payment in full, and permanently deletes all workspaces, links, and click history. This cannot be undone.'
                : "This schedules cancellation for the end of your current billing period. You'll keep access until then, no refund is issued, and your data is kept."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-confirm" className="text-sm text-muted-foreground">
              Type <span className="font-medium text-foreground">CANCEL</span> to confirm
            </label>
            <Input
              id="cancel-confirm"
              value={cancelConfirmText}
              onChange={(e) => setCancelConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              disabled={cancelConfirmText !== 'CANCEL' || isCancelling}
              onClick={handleCancel}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
