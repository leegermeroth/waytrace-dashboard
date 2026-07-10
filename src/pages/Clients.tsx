import { useEffect, useState, type FormEvent } from 'react'
import {
  batchTaxonomyValues,
  createClient,
  deleteClient,
  getTaxonomyValues,
  listClients,
  updateClient,
  type Client,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
import { deriveTaxonomy, PlatformPicker, platformsFromTaxonomy } from '@/components/TaxonomyWizard'
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

interface ClientFormState {
  id: number | null
  name: string
  slug: string
  short_domain: string
}

const emptyForm: ClientFormState = { id: null, name: '', slug: '', short_domain: '' }

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Client create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Setup wizard (appears after new client is created)
  const [wizardClientId, setWizardClientId] = useState<number | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [paidSocial, setPaidSocial] = useState(false)
  const [wizardSaving, setWizardSaving] = useState(false)
  const [wizardError, setWizardError] = useState<string | null>(null)
  // When creating a workspace after others exist, we pre-fill from the most
  // recent one and name it here so the copy can explain the scope clearly.
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [prevWorkspaceName, setPrevWorkspaceName] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  function refresh() {
    setIsLoading(true)
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workspaces'))
      .finally(() => setIsLoading(false))
  }

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(client: Client) {
    setForm({
      id: client.id,
      name: client.name,
      slug: client.slug,
      short_domain: client.short_domain ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      if (form.id) {
        await updateClient(form.id, {
          name: form.name,
          slug: form.slug,
          short_domain: form.short_domain || undefined,
        })
        setDialogOpen(false)
        refresh()
      } else {
        // The current `clients` closure is the list *before* this creation — the
        // most recent of those is the "previous workspace" to pre-fill from.
        const previous = [...clients].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]

        const created = await createClient(form.name, form.slug, form.short_domain || undefined)
        setDialogOpen(false)
        refresh()

        // Pre-fill the wizard from the previous workspace's approved values, so a
        // new workspace inherits a sensible starting point. Edits here apply only
        // to the new workspace (a separate client_id) — never the previous one.
        let prefill = { selected: new Set<string>(), paidSocial: false }
        if (previous) {
          try {
            const [src, med] = await Promise.all([
              getTaxonomyValues(previous.id, 'utm_source'),
              getTaxonomyValues(previous.id, 'utm_medium'),
            ])
            prefill = platformsFromTaxonomy(src, med)
          } catch {
            /* Non-fatal — fall back to an empty picker. */
          }
        }

        setWizardClientId(created.id)
        setNewWorkspaceName(created.name)
        setPrevWorkspaceName(previous?.name ?? null)
        setSelectedPlatforms(prefill.selected)
        setPaidSocial(prefill.paidSocial)
        setWizardError(null)
        setWizardOpen(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workspace')
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

  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleWizardSave() {
    if (!wizardClientId) return
    setWizardSaving(true)
    setWizardError(null)

    try {
      // Derive unique sources and mediums from selected platforms.
      const { sources, mediums } = deriveTaxonomy(selectedPlatforms, paidSocial)

      const tasks: Promise<unknown>[] = []
      if (sources.length > 0) {
        tasks.push(batchTaxonomyValues(wizardClientId, 'utm_source', sources))
      }
      if (mediums.length > 0) {
        tasks.push(batchTaxonomyValues(wizardClientId, 'utm_medium', mediums))
      }
      await Promise.all(tasks)
      setWizardOpen(false)
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Failed to save taxonomy values')
    } finally {
      setWizardSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Team"
        title="Workspaces"
        description="Group links under a brand or client, each with its own short domain and approved values."
        actions={<Button onClick={openCreate}>New workspace</Button>}
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
          <Button className="mt-4" onClick={openCreate}>
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
              <TableHead>Short domain</TableHead>
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
                  {client.short_domain || 'waygo.to'}
                </TableCell>
                <TableCell>
                  <StatusDot tone={client.is_active ? 'success' : 'neutral'}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </StatusDot>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
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
              <Label htmlFor="client_domain">Short domain (optional)</Label>
              <Input
                id="client_domain"
                value={form.short_domain}
                onChange={(e) => setForm((f) => ({ ...f, short_domain: e.target.value }))}
                placeholder="go.theirdomain.com"
              />
            </div>
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

      {/* Setup wizard — appears after a new client is created */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Approved values for {newWorkspaceName ? `“${newWorkspaceName}”` : 'this workspace'}
            </DialogTitle>
            <DialogDescription>
              Pick the platforms you use. Waytrace will pre-load matching source and medium values so
              your team stays consistent. You can add more any time.
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
                  Pre-filled from your most recent workspace,{' '}
                  <span className="font-medium text-foreground">{prevWorkspaceName}</span>. Changes
                  here apply only to{' '}
                  <span className="font-medium text-foreground">
                    {newWorkspaceName || 'this workspace'}
                  </span>{' '}
                  — {prevWorkspaceName} is left untouched.
                </span>
              </div>
            )}

            <PlatformPicker
              selected={selectedPlatforms}
              onToggle={togglePlatform}
              paidSocial={paidSocial}
              onPaidSocialChange={setPaidSocial}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>
              Skip
            </Button>
            <Button
              type="button"
              disabled={wizardSaving || (selectedPlatforms.size === 0 && !paidSocial)}
              onClick={handleWizardSave}
            >
              {wizardSaving ? 'Saving…' : 'Save approved values'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
