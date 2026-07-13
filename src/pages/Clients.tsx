import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  batchTaxonomyValues,
  createClient,
  deleteClient,
  getMe,
  getTaxonomyValues,
  listClients,
  listDomains,
  updateClient,
  type Client,
  type CustomDomain,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
import { TrackingFoundation } from '@/components/TrackingFoundation'
import {
  deriveFoundation,
  emptyFoundation,
  foundationFromValues,
  type FoundationState,
} from '@/lib/trackingFoundation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Sentinel for the "shared default (waygo.to)" option in the domain picker —
// base-ui Select wants a non-empty value; this maps to link_domain = null.
const SHARED_DEFAULT = '__shared__'

interface ClientFormState {
  id: number | null
  name: string
  slug: string
  /** A verified domain hostname, or SHARED_DEFAULT for waygo.to. */
  linkDomain: string
}

const emptyForm: ClientFormState = { id: null, name: '', slug: '', linkDomain: SHARED_DEFAULT }

export default function Clients() {
  const { tier } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [domains, setDomains] = useState<CustomDomain[]>([])
  const [maxClients, setMaxClients] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Client create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Copy Tracking Foundation from an existing workspace (default on).
  const [copyEnabled, setCopyEnabled] = useState(true)
  const [copyFromId, setCopyFromId] = useState<number | null>(null)

  // Professional upgrade prompt (shown when a pro account hits its 1-workspace cap)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // Tracking Foundation wizard (appears after a new workspace is created)
  const [wizardClientId, setWizardClientId] = useState<number | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [foundation, setFoundation] = useState<FoundationState>(emptyFoundation)
  const [wizardSaving, setWizardSaving] = useState(false)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [prevWorkspaceName, setPrevWorkspaceName] = useState<string | null>(null)

  useEffect(() => {
    refresh()
    getMe()
      .then((me) => setMaxClients(me.max_clients))
      .catch(() => setMaxClients(null))
    // Verified domains feed the "domain for new links" picker. Only usable
    // ones (active or still-pending) are offered.
    listDomains()
      .then(({ domains }) => setDomains(domains.filter((d) => d.status !== 'failed')))
      .catch(() => setDomains([]))
  }, [])

  function refresh() {
    setIsLoading(true)
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workspaces'))
      .finally(() => setIsLoading(false))
  }

  function handleNewWorkspace() {
    // Professional includes a single workspace — nudge to Team instead of a raw error.
    const cap = tier === 'pro' ? 1 : maxClients
    if (cap != null && clients.length >= cap) {
      setUpgradeOpen(true)
      return
    }
    openCreate()
  }

  function openCreate() {
    setForm(emptyForm)
    // Default the copy source to the most recent workspace.
    const recent = [...clients].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    setCopyEnabled(clients.length > 0)
    setCopyFromId(recent?.id ?? null)
    setDialogOpen(true)
  }

  function openEdit(client: Client) {
    setForm({
      id: client.id,
      name: client.name,
      slug: client.slug,
      linkDomain: client.link_domain ?? SHARED_DEFAULT,
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const linkDomain = form.linkDomain === SHARED_DEFAULT ? null : form.linkDomain
    try {
      if (form.id) {
        await updateClient(form.id, {
          name: form.name,
          slug: form.slug,
          link_domain: linkDomain,
        })
        setDialogOpen(false)
        refresh()
      } else {
        const copySource = copyEnabled ? clients.find((c) => c.id === copyFromId) ?? null : null

        const created = await createClient(form.name, form.slug, undefined, linkDomain)
        setDialogOpen(false)
        refresh()

        // Pre-fill the wizard from the chosen workspace's tracking values, so a
        // new workspace inherits a sensible starting point. Edits here apply only
        // to the new workspace (a separate client_id) — never the source one.
        let prefill = emptyFoundation()
        if (copySource) {
          try {
            const [src, med] = await Promise.all([
              getTaxonomyValues(copySource.id, 'utm_source'),
              getTaxonomyValues(copySource.id, 'utm_medium'),
            ])
            prefill = foundationFromValues(src, med)
          } catch {
            /* Non-fatal — fall back to an empty foundation. */
          }
        }

        setWizardClientId(created.id)
        setNewWorkspaceName(created.name)
        setPrevWorkspaceName(copySource?.name ?? null)
        setFoundation(prefill)
        setWizardError(null)
        setWizardOpen(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save workspace'
      // A server-side limit rejection also routes to the upgrade prompt.
      if (/plan allows|upgrade/i.test(message) && tier === 'pro') {
        setDialogOpen(false)
        setUpgradeOpen(true)
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete "${client.name}"? Links under this workspace will also be removed.`)) return
    try {
      await deleteClient(client.id)
      setClients((prev) => prev.filter((c) => c.id !== client.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace')
    }
  }

  async function handleWizardSave() {
    if (!wizardClientId) return
    setWizardSaving(true)
    setWizardError(null)
    try {
      const { sources, mediums } = deriveFoundation(foundation)
      const tasks: Promise<unknown>[] = []
      if (sources.length > 0) tasks.push(batchTaxonomyValues(wizardClientId, 'utm_source', sources))
      if (mediums.length > 0) tasks.push(batchTaxonomyValues(wizardClientId, 'utm_medium', mediums))
      await Promise.all(tasks)
      setWizardOpen(false)
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Failed to save tracking values')
    } finally {
      setWizardSaving(false)
    }
  }

  const derivedFoundation = deriveFoundation(foundation)
  const foundationEmpty =
    derivedFoundation.sources.length === 0 && derivedFoundation.mediums.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Team"
        title="Workspaces"
        description="Group links under a brand or client, each with its own short domain and tracking values."
        actions={<Button onClick={handleNewWorkspace}>New workspace</Button>}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && clients.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            No workspaces yet. Create one to organize your campaign links.
          </p>
          <Button className="mt-4" onClick={handleNewWorkspace}>
            New workspace
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="[&_td]:py-2 [&_th]:h-9">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>New-link domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell className="mono text-xs text-muted-foreground">{client.slug}</TableCell>
                <TableCell className="mono text-xs text-muted-foreground">
                  {client.link_domain || 'waygo.to'}
                </TableCell>
                <TableCell>
                  <StatusDot tone={client.is_active ? 'success' : 'neutral'}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </StatusDot>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/dashboard/settings/tracking-foundation?workspace=${client.id}`)}
                    >
                      Foundation
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(client)}>
                      Edit
                    </Button>
                    <Button variant="destructive-ghost" size="sm" onClick={() => handleDelete(client)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit workspace' : 'New workspace'}</DialogTitle>
            <DialogDescription>
              Workspaces group links under a brand and can have their own short domain.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="client_name">Name</Label>
              <Input
                id="client_name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="client_slug">Slug</Label>
              <Input
                id="client_slug"
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                placeholder="lowercase-with-hyphens"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="client_domain">Domain for new links</Label>
              <Select
                value={form.linkDomain}
                onValueChange={(v) => setForm((f) => ({ ...f, linkDomain: v ?? SHARED_DEFAULT }))}
              >
                <SelectTrigger id="client_domain" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED_DEFAULT}>waygo.to (shared)</SelectItem>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.hostname}>
                      {d.hostname}{d.status === 'pending' ? ' (pending DNS)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                New links in this workspace use this domain. Existing links keep the domain they were
                created on. {domains.length === 0 && 'Add your own domain under Domains first.'}
              </p>
            </div>

            {/* Copy Tracking Foundation from an existing workspace. */}
            {!form.id && clients.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-ochre"
                    checked={copyEnabled}
                    onChange={(e) => setCopyEnabled(e.target.checked)}
                  />
                  Copy Tracking Foundation from another workspace
                </label>
                {copyEnabled && (
                  <Select
                    value={copyFromId != null ? String(copyFromId) : undefined}
                    onValueChange={(v) => setCopyFromId(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  You'll be able to customize the values before they're saved.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tracking Foundation wizard — appears after a new workspace is created */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Tracking foundation for {newWorkspaceName ? `“${newWorkspaceName}”` : 'this workspace'}
            </DialogTitle>
            <DialogDescription>
              Turn on the channels this workspace builds links for. Waytrace will create matching source
              and medium values. You can add more any time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            {wizardError && (
              <Alert variant="destructive">
                <AlertDescription>{wizardError}</AlertDescription>
              </Alert>
            )}

            {prevWorkspaceName && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-cast p-3 text-xs text-muted-foreground">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                <span>
                  Copied from{' '}
                  <span className="font-medium text-foreground">{prevWorkspaceName}</span>. Changes here
                  apply only to{' '}
                  <span className="font-medium text-foreground">{newWorkspaceName || 'this workspace'}</span>{' '}
                  — {prevWorkspaceName} is left untouched.
                </span>
              </div>
            )}

            <TrackingFoundation state={foundation} onChange={setFoundation} showOrgType={false} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>
              Skip
            </Button>
            <Button type="button" disabled={wizardSaving || foundationEmpty} onClick={handleWizardSave}>
              {wizardSaving ? 'Saving…' : 'Save tracking values'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Professional → Team upgrade prompt */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Need another workspace?</DialogTitle>
            <DialogDescription>
              Professional includes one workspace. Upgrade to Team to organize multiple brands, clients,
              or business units under one account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Maybe later
            </Button>
            <Button onClick={() => navigate('/dashboard/billing')}>Upgrade to Team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
