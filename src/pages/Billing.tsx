import { useEffect, useState, type FormEvent } from 'react'
import {
  cancelSubscription,
  createCheckoutSession,
  createPortalSession,
  enterpriseInquiry,
  getMe,
  retryRefund,
  restoreData,
  type Me,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Labels and display prices only. The Worker owns the Stripe Price catalog and
// resolves this plan/interval selection server-side.
const PLANS = [
  {
    tier: 'pro' as const,
    label: 'Professional',
    monthly: { price: '$12/mo' },
    annual: { price: '$95/yr' },
  },
  {
    tier: 'agency' as const,
    label: 'Team',
    monthly: { price: '$45/mo' },
    annual: { price: '$395/yr' },
  },
]

const TIER_LABELS: Record<string, string> = {
  free: 'Free Builder',
  pro: 'Professional',
  agency: 'Team',
}

// Low → high, so we can label a plan change as an upgrade vs. a downgrade.
const TIER_RANK: Record<string, number> = { free: 0, pro: 1, agency: 2 }

function statusVariant(status: string | undefined): 'success' | 'secondary' | 'destructive' {
  if (status === 'active' || status === 'trialing') return 'success'
  if (status === 'cancelled' || status === 'unpaid') return 'destructive'
  return 'secondary'
}

export default function Billing() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  // Annual is the default view — it's the better-value option we want to lead with.
  const [interval, setInterval] = useState<'monthly' | 'annual'>('annual')

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelConfirmText, setCancelConfirmText] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<string | null>(null)
  const [isRetryingRefund, setIsRetryingRefund] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  // Enterprise inquiry form.
  const [entName, setEntName] = useState('')
  const [entEmail, setEntEmail] = useState('')
  const [entCompany, setEntCompany] = useState('')
  const [entMessage, setEntMessage] = useState('')
  const [entSending, setEntSending] = useState(false)
  const [entError, setEntError] = useState<string | null>(null)
  const [entSent, setEntSent] = useState(false)

  useEffect(() => {
    load()
  }, [])

  function load() {
    getMe()
      .then((data) => {
        setMe(data)
        // Prefill the Enterprise form from the account, but don't clobber edits.
        setEntName((n) => n || data.name || '')
        setEntEmail((e) => e || data.email || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing info'))
  }

  async function handleEnterpriseInquiry(e: FormEvent) {
    e.preventDefault()
    setEntError(null)
    setEntSending(true)
    try {
      await enterpriseInquiry({
        name: entName,
        email: entEmail,
        company: entCompany,
        message: entMessage,
      })
      setEntSent(true)
    } catch (err) {
      setEntError(err instanceof Error ? err.message : 'Could not send your inquiry')
    } finally {
      setEntSending(false)
    }
  }

  async function handleUpgrade(plan: 'pro' | 'agency', selectedInterval: 'monthly' | 'annual') {
    const actionKey = `${plan}:${selectedInterval}`
    setError(null)
    setPendingAction(actionKey)
    try {
      const { url } = await createCheckoutSession(plan, selectedInterval)
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
      if (result.effective === 'immediate') {
        const retained = result.grace_period_ends_at
          ? ` Your workspaces, links, and click history are retained until ${formatDate(result.grace_period_ends_at)} — restore them any time before then.`
          : ' Your workspaces, links, and click history are retained so you can restore them.'
        const refundNote = result.refunded
          ? ' Your latest payment has been refunded.'
          : " We couldn't process your refund automatically — you can retry it below."
        setCancelResult(`Subscription cancelled and you've been moved to the Free plan.${refundNote}${retained}`)
      } else {
        setCancelResult(
          "Subscription will cancel at the end of your current billing period. You'll keep full access until then, and your data stays intact — no refund is issued for cancellations after the 14-day window."
        )
      }
      setCancelDialogOpen(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription')
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleRetryRefund() {
    setError(null)
    setIsRetryingRefund(true)
    try {
      const result = await retryRefund()
      setCancelResult(
        result.refund_state === 'succeeded'
          ? 'Your refund has been processed.'
          : "We still couldn't process the refund. Please try again shortly or contact support."
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry the refund')
    } finally {
      setIsRetryingRefund(false)
    }
  }

  async function handleRestore() {
    setError(null)
    setIsRestoring(true)
    try {
      await restoreData()
      setCancelResult('Your data has been kept. Resubscribe any time to regain full access.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore your data')
    } finally {
      setIsRestoring(false)
    }
  }

  const inWindow = withinRefundWindow(me?.subscription_started_at)
  const cancellation = me?.cancellation ?? null
  const inGracePeriod = cancellation?.data_state === 'grace_period' || cancellation?.data_state === 'purge_scheduled'
  const refundFailed = cancellation?.refund_state === 'failed'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Billing"
        title="Billing"
        description="Manage your plan, billing interval, and subscription."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge className="capitalize">{me?.tier ? (TIER_LABELS[me.tier] ?? me.tier) : '—'}</Badge>
          <Badge variant={statusVariant(me?.subscription_status)} className="capitalize">
            {me?.subscription_status ?? '—'}
          </Badge>
          {me?.billing_interval && (
            <Badge variant="secondary">
              {me.billing_interval === 'annual' ? 'Annual' : 'Monthly'}
            </Badge>
          )}
        </CardContent>
        {me?.stripe_customer_id && (
          <CardFooter>
            <Button variant="outline" disabled={pendingAction === 'portal'} onClick={handleManageBilling}>
              {pendingAction === 'portal' ? 'Opening...' : 'Manage billing'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className="flex max-w-xl items-center gap-3">
        <span className="eyebrow-sm">Billing interval</span>
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
          const actionKey = `${plan.tier}:${interval}`
          const isCurrentPrice = me?.billing_plan === plan.tier && me?.billing_interval === interval
          const isCurrentTierOtherInterval = me?.tier === plan.tier && !isCurrentPrice
          const currentRank = TIER_RANK[me?.tier ?? 'free'] ?? 0
          const changeVerb = (TIER_RANK[plan.tier] ?? 0) < currentRank ? 'Downgrade' : 'Upgrade'
          return (
            <Card key={plan.tier}>
              <CardHeader>
                <CardTitle>{plan.label}</CardTitle>
                <CardDescription className="mono pt-1 text-base text-foreground">
                  {selected.price}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={isCurrentPrice || pendingAction === actionKey}
                  onClick={() => handleUpgrade(plan.tier, interval)}
                >
                  {isCurrentPrice
                    ? 'Current plan'
                    : pendingAction === actionKey
                      ? 'Redirecting...'
                      : isCurrentTierOtherInterval
                        ? `Switch to ${interval === 'annual' ? 'annual' : 'monthly'} billing`
                        : `${changeVerb} to ${plan.label}`}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Need Enterprise?</CardTitle>
          <CardDescription>
            Custom workspaces, users, branded domains, and support for larger teams. Tell us what you
            need and we'll be in touch — no checkout required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entSent ? (
            <Alert>
              <AlertDescription>Thanks — we've got your inquiry and will be in touch shortly.</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleEnterpriseInquiry} className="flex flex-col gap-4">
              {entError && (
                <Alert variant="destructive">
                  <AlertDescription>{entError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ent_name">Name</Label>
                  <Input id="ent_name" required value={entName} onChange={(e) => setEntName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ent_email">Email</Label>
                  <Input
                    id="ent_email"
                    type="email"
                    required
                    value={entEmail}
                    onChange={(e) => setEntEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ent_company">Company (optional)</Label>
                <Input id="ent_company" value={entCompany} onChange={(e) => setEntCompany(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ent_message">What do you need? (optional)</Label>
                <textarea
                  id="ent_message"
                  rows={4}
                  value={entMessage}
                  onChange={(e) => setEntMessage(e.target.value)}
                  placeholder="Team size, number of brands or domains, timelines, anything else…"
                  className="min-h-24 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <Button type="submit" disabled={entSending} className="w-fit">
                {entSending ? 'Sending…' : 'Contact sales'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Reversible grace period after an immediate cancellation — data is retained, not deleted. */}
      {inGracePeriod && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Your data is retained</CardTitle>
            <CardDescription>
              {cancellation?.grace_period_ends_at
                ? `Your subscription is cancelled, but your workspaces, links, and click history are kept until ${formatDate(cancellation.grace_period_ends_at)}. Restore them to keep them, or resubscribe above to regain full access. Nothing has been deleted.`
                : 'Your subscription is cancelled, but your workspaces, links, and click history are retained. Restore them to keep them, or resubscribe above to regain full access. Nothing has been deleted.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {refundFailed && (
              <Alert variant="destructive">
                <AlertDescription>
                  We couldn't process your refund automatically. Your data is safe — you can retry the refund
                  below, and it will never affect your retained data.
                </AlertDescription>
              </Alert>
            )}
            {cancelResult && (
              <Alert>
                <AlertDescription>{cancelResult}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? 'Keeping your data…' : 'Keep my data'}
            </Button>
            {refundFailed && (
              <Button variant="outline" onClick={handleRetryRefund} disabled={isRetryingRefund}>
                {isRetryingRefund ? 'Retrying refund…' : 'Retry refund'}
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      {me?.stripe_subscription_id && !inGracePeriod && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Cancel subscription</CardTitle>
            <CardDescription>
              {cancellation?.service_state === 'cancel_at_period_end'
                ? "Your subscription is scheduled to cancel at the end of your current billing period. You keep full access until then, and your data stays intact."
                : inWindow
                  ? `You're within the ${REFUND_WINDOW_DAYS}-day refund window. Cancelling now stops billing immediately and refunds your latest payment in full. Your workspaces, links, and click history are kept for ${REFUND_WINDOW_DAYS === 14 ? '30 days' : 'a grace period'} so you can restore them — nothing is deleted right away.`
                  : "You're past the refund window. Cancelling stops future billing at the end of your current period — no refund is issued, your data is not deleted, and existing links keep working."}
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
                ? 'This immediately cancels your subscription and refunds your latest payment in full. You move to the Free plan, and your workspaces, links, and click history are retained for a grace period so you can restore them — nothing is deleted right away.'
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
