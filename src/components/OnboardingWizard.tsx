import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  batchTaxonomyValues,
  createClient,
  createDomain,
  listClients,
  setOrgType,
  updateClient,
  type Client,
  type CustomDomain,
} from '@/lib/api'
import {
  deriveFoundation,
  emptyFoundation,
  enabledChannels,
  type FoundationState,
} from '@/lib/trackingFoundation'
import { TrackingFoundation } from '@/components/TrackingFoundation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WaytraceMark } from '@/components/brand'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Auto-slug a workspace name the same way the Workspaces form expects. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const STEPS = ['Welcome', 'Workspace', 'Tracking Foundation', 'Review'] as const

/** Basic hostname sanity check for the optional branded short domain. */
function isValidHostname(host: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(host.trim().toLowerCase())
}

/**
 * Guided Tracking Foundation setup — the one-time, account-level onboarding
 * shown on the account owner's first login (gated by `needsOnboarding`). Four
 * steps: Welcome → Workspace → Tracking Foundation → Review & Finish. It creates
 * the first workspace, records the organization type, seeds the workspace's
 * tracking values (sources + mediums), and can register an optional branded
 * short domain. Closing, skipping, or finishing stamps the onboarding flag so it
 * never re-opens.
 */
export function OnboardingWizard() {
  const { needsOnboarding, markOnboarded, tier } = useAuth()
  const [step, setStep] = useState(0)

  const isProfessional = tier === 'pro'

  const [clients, setClients] = useState<Client[] | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [domainHost, setDomainHost] = useState('')
  const [foundation, setFoundation] = useState<FoundationState>(emptyFoundation)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdDomain, setCreatedDomain] = useState<{ domain: CustomDomain; cnameTarget: string } | null>(null)

  // Load existing workspaces once. If the owner already has one (e.g. created
  // via the WP plugin), we target it instead of creating a duplicate.
  useEffect(() => {
    if (!needsOnboarding || clients !== null) return
    listClients()
      .then(setClients)
      .catch(() => setClients([]))
  }, [needsOnboarding, clients])

  const existing = clients && clients.length > 0 ? clients[0] : null
  const { sources, mediums } = useMemo(() => deriveFoundation(foundation), [foundation])
  const activeChannels = useMemo(() => enabledChannels(foundation), [foundation])

  if (!needsOnboarding) return null

  const totalSteps = STEPS.length
  const progress = Math.round(((step + 1) / totalSteps) * 100)
  const effectiveWorkspaceName = existing?.name || workspaceName.trim()

  async function handleSkip() {
    await markOnboarded()
  }

  function handleContinue() {
    setError(null)
    if (step === 1) {
      if (!existing && !workspaceName.trim()) {
        setError('Give your workspace a name to continue.')
        return
      }
      if (domainHost.trim() && !isValidHostname(domainHost)) {
        setError('That doesn’t look like a valid domain. Use something like go.yourdomain.com — or clear it to use the default.')
        return
      }
    }
    setStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  async function handleFinish() {
    setSaving(true)
    setError(null)
    try {
      // 1. Record organization type (best-effort — never block on it).
      if (foundation.orgType) {
        try {
          await setOrgType(foundation.orgType)
        } catch {
          /* non-fatal */
        }
      }

      // 2. Resolve the target workspace: an existing one, or create the first.
      let target: Client
      if (existing) {
        target = existing
      } else {
        const name = workspaceName.trim()
        target = await createClient(name, slugify(name) || 'workspace')
      }
      const targetId = target.id

      // 3. Seed tracking values (skip empty fields).
      const tasks: Promise<unknown>[] = []
      if (sources.length) tasks.push(batchTaxonomyValues(targetId, 'utm_source', sources))
      if (mediums.length) tasks.push(batchTaxonomyValues(targetId, 'utm_medium', mediums))
      await Promise.all(tasks)

      // 4. Register the optional branded short domain, then point this
      //    workspace's new links at it. On success we pause on a confirmation
      //    panel showing the DNS record; failures surface instead of being
      //    silently swallowed.
      if (domainHost.trim() && !createdDomain) {
        try {
          const host = domainHost.trim().toLowerCase()
          const result = await createDomain(host)
          await updateClient(targetId, { name: target.name, slug: target.slug, link_domain: host })
          setCreatedDomain(result)
          setSaving(false)
          return
        } catch (err) {
          setError(
            (err instanceof Error ? err.message : 'Could not add that domain') +
              ' — you can add it later in Settings. Clear the field to finish without it.'
          )
          setSaving(false)
          return
        }
      }

      await markOnboarded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. You can finish setup later.')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void handleSkip() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* Progress bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="eyebrow-sm">
              Step {step + 1} of {totalSteps} · {STEPS[step]}
            </span>
            <span className="mono text-[0.625rem] text-slate">{progress}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-ochre transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step 1 — Welcome ─────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2.5">
                <WaytraceMark size={26} />
                <span className="eyebrow">Tracking foundation</span>
              </div>
              <DialogTitle>Build your tracking foundation</DialogTitle>
              <DialogDescription>
                A few thoughtful choices now will keep every campaign consistent later.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              First, you'll create a workspace for your brand or client. Then, you'll add the sources
              and mediums your team uses most often. Waytrace will use these as shared reference points
              whenever someone builds a link.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DefinitionCard title="Workspace" body="Keeps links organized under one brand or client." />
              <DefinitionCard
                title="Tracking Values"
                body="Keep common tracking terms consistent across every campaign."
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={handleSkip}>Skip for now</Button>
              <Button onClick={() => setStep(1)}>Get started</Button>
            </div>
          </>
        )}

        {/* ── Step 2 — Workspace ───────────────────────────────────────── */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>
                {existing
                  ? 'Your workspace'
                  : isProfessional
                    ? 'Build your workspace'
                    : 'Build your first workspace'}
              </DialogTitle>
              <DialogDescription>
                {existing
                  ? `We'll build the tracking foundation for “${existing.name}”. You can add more workspaces any time.`
                  : 'Every link belongs to a workspace. Most people create one for their company, but you can also create separate workspaces for clients, brands, or business units.'}
              </DialogDescription>
            </DialogHeader>

            {!existing && (
              <div className="flex flex-col gap-2 py-1">
                <Label htmlFor="onboarding_ws">Workspace name</Label>
                <Input
                  id="onboarding_ws"
                  autoFocus
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Acme Marketing"
                />
                <p className="text-xs text-muted-foreground">
                  {isProfessional
                    ? 'Give your workspace a name. You can rename it anytime.'
                    : 'Start with one workspace. You can add more anytime.'}
                </p>
                {workspaceName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Slug: <span className="mono">{slugify(workspaceName) || 'workspace'}</span>
                  </p>
                )}
              </div>
            )}

            {/* Optional branded short domain. */}
            <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
              <Label htmlFor="onboarding_domain">Branded short domain — optional</Label>
              <p className="text-xs text-muted-foreground">
                Short links can run on your own domain instead of the shared <span className="mono">waygo.to</span>.
                Two common approaches:
              </p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                  A subdomain of your site — <span className="mono">go.yourdomain.com</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                  A short domain you own just for links — like <span className="mono">waygo.to</span>
                </li>
              </ul>
              <Input
                id="onboarding_domain"
                value={domainHost}
                onChange={(e) => setDomainHost(e.target.value)}
                placeholder="go.yourdomain.com"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground">
                Skip this to use <span className="mono">waygo.to</span>. On the shared domain each short
                link must be globally unique; on your own domain your links only need to be unique to you.
                You'll get a DNS record to finish setup after this.
              </p>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkip}>Skip</Button>
                <Button onClick={handleContinue}>Continue</Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3 — Tracking Foundation ─────────────────────────────── */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Build your tracking foundation</DialogTitle>
              <DialogDescription>
                Add the channels your team actively builds links for. Waytrace turns these into a shared
                set of sources and mediums for{' '}
                <span className="font-medium text-foreground">{effectiveWorkspaceName || 'your workspace'}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-1">
              <TrackingFoundation state={foundation} onChange={setFoundation} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkip} disabled={saving}>Skip</Button>
                <Button onClick={() => { setError(null); setStep(3) }}>Review</Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 4 — Review & Finish ─────────────────────────────────── */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle>Your tracking foundation is ready</DialogTitle>
              <DialogDescription>
                Here's what we'll set up. You can change any of it later.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-1">
              <ReviewGroup label="Workspace">
                <ReviewRow>{effectiveWorkspaceName || '—'}</ReviewRow>
                <ReviewRow>
                  {domainHost.trim() ? domainHost.trim().toLowerCase() : 'waygo.to (shared)'}
                </ReviewRow>
              </ReviewGroup>

              <ReviewGroup label="Tracking Values">
                <ReviewRow>{sources.length} {sources.length === 1 ? 'Source' : 'Sources'}</ReviewRow>
                <ReviewRow>{mediums.length} {mediums.length === 1 ? 'Medium' : 'Mediums'}</ReviewRow>
              </ReviewGroup>

              {activeChannels.length > 0 && (
                <ReviewGroup label="Marketing Channels">
                  {activeChannels.map((c) => (
                    <ReviewRow key={c.id}>{c.name}</ReviewRow>
                  ))}
                </ReviewGroup>
              )}

              {/* Once the branded domain is provisioned, show the DNS record to finish. */}
              {createdDomain && (
                <div className="flex flex-col gap-2 rounded-md border border-ochre/50 bg-cast p-3">
                  <span className="eyebrow-sm">One last step — add this DNS record</span>
                  <p className="text-xs text-muted-foreground">
                    At your domain registrar, add a CNAME so{' '}
                    <span className="mono">{createdDomain.domain.hostname}</span> points to Waytrace.
                    Your links keep working on <span className="mono">waygo.to</span> until it's live.
                  </p>
                  <div className="rounded bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                    <div><span className="text-muted-foreground">Type:</span> CNAME</div>
                    <div><span className="text-muted-foreground">Name:</span> {createdDomain.domain.hostname.split('.')[0]}</div>
                    <div><span className="text-muted-foreground">Value:</span> {createdDomain.cnameTarget}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can always find this again under Settings → Domains.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={saving || createdDomain != null}>
                Back
              </Button>
              <div className="flex gap-2">
                {!createdDomain && (
                  <Button variant="outline" onClick={handleSkip} disabled={saving}>Skip</Button>
                )}
                <Button onClick={createdDomain ? () => void markOnboarded() : handleFinish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Start Building Links'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DefinitionCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-cast p-3">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </div>
  )
}

function ReviewGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow-sm">{label}</span>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function ReviewRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check size={14} className="shrink-0 text-ochre" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
