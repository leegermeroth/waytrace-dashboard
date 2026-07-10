import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { batchTaxonomyValues, createClient, listClients, type Client } from '@/lib/api'
import { deriveTaxonomy, PlatformPicker } from '@/components/TaxonomyWizard'
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

const STEPS = ['Welcome', 'Workspace', 'Approved values'] as const

/**
 * Guided Tracking Foundation Setup — the one-time, account-level onboarding
 * shown on the account owner's first login (gated by `needsOnboarding`). Walks
 * through creating a first workspace and seeding approved UTM values, with light
 * education on each field. Closing or skipping stamps the onboarding flag so it
 * never re-opens; finishing stamps it too.
 */
export function OnboardingWizard() {
  const { needsOnboarding, markOnboarded } = useAuth()
  const [step, setStep] = useState(0)

  const [clients, setClients] = useState<Client[] | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paidSocial, setPaidSocial] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing workspaces once, when the wizard becomes relevant. If the
  // owner already has a workspace (e.g. created via the WP plugin), we target it
  // instead of creating a new one.
  useEffect(() => {
    if (!needsOnboarding || clients !== null) return
    listClients()
      .then(setClients)
      .catch(() => setClients([]))
  }, [needsOnboarding, clients])

  if (!needsOnboarding) return null

  const existing = clients && clients.length > 0 ? clients[0] : null
  const totalSteps = STEPS.length
  const progress = Math.round(((step + 1) / totalSteps) * 100)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSkip() {
    // Stamp so the wizard is truly one-time, then let it unmount.
    await markOnboarded()
  }

  function handleContinue() {
    setError(null)
    // On the workspace step, require a name only when there's no existing one.
    if (step === 1 && !existing && !workspaceName.trim()) {
      setError('Give your first workspace a name to continue.')
      return
    }
    setStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  async function handleFinish() {
    setSaving(true)
    setError(null)
    try {
      // Resolve the target workspace: an existing one, or create the first.
      let targetId: number
      if (existing) {
        targetId = existing.id
      } else {
        const name = workspaceName.trim()
        const created = await createClient(name, slugify(name) || 'workspace')
        targetId = created.id
      }

      // Seed approved values (best-effort — skip empty).
      const { sources, mediums } = deriveTaxonomy(selected, paidSocial)
      const tasks: Promise<unknown>[] = []
      if (sources.length) tasks.push(batchTaxonomyValues(targetId, 'utm_source', sources))
      if (mediums.length) tasks.push(batchTaxonomyValues(targetId, 'utm_medium', mediums))
      await Promise.all(tasks)

      await markOnboarded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. You can finish setup later.')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void handleSkip() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
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

        {step === 0 && (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2.5">
                <WaytraceMark size={26} />
                <span className="eyebrow">Tracking foundation</span>
              </div>
              <DialogTitle>Set up your tracking foundation</DialogTitle>
              <DialogDescription>
                A minute now saves hours later. We'll set up your first workspace and a short list of
                approved UTM values, so every link your team builds measures campaigns the same way —
                consistent, comparable, and clean in your analytics.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2 py-1 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                A <strong className="font-medium text-foreground">workspace</strong> groups links under one brand or client.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                <strong className="font-medium text-foreground">Approved values</strong> keep sources and mediums spelled the same way, every time.
              </li>
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={handleSkip}>Skip for now</Button>
              <Button onClick={() => setStep(1)}>Get started</Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>{existing ? 'Your workspace' : 'Name your first workspace'}</DialogTitle>
              <DialogDescription>
                {existing
                  ? `We'll set approved values for "${existing.name}". You can add more workspaces any time.`
                  : 'A workspace groups links under one brand or client, each with its own approved values and optional short domain.'}
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
                {workspaceName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Slug: <span className="mono">{slugify(workspaceName) || 'workspace'}</span>
                  </p>
                )}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkip}>Skip</Button>
                <Button onClick={handleContinue}>Continue</Button>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Choose your approved values</DialogTitle>
              <DialogDescription>
                Pick the platforms you use. We'll pre-load matching source and medium values into this
                workspace — you can always edit or add more later.
              </DialogDescription>
            </DialogHeader>
            <div className="py-1">
              <PlatformPicker
                selected={selected}
                onToggle={toggle}
                paidSocial={paidSocial}
                onPaidSocialChange={setPaidSocial}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkip} disabled={saving}>Skip</Button>
                <Button onClick={handleFinish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Finish setup'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
