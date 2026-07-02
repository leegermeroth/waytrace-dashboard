import { useEffect, useState, type FormEvent } from 'react'
import { batchTaxonomyValues, createClient, deleteClient, listClients, updateClient, type Client } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

// -------------------------------------------------------------------------
// Wizard platform definitions
// -------------------------------------------------------------------------

interface Platform {
  id: string
  label: string
  source: string
  medium: string
}

const PLATFORMS: Platform[] = [
  { id: 'klaviyo',   label: 'Klaviyo (email)',  source: 'klaviyo',   medium: 'email' },
  { id: 'facebook',  label: 'Facebook',         source: 'facebook',  medium: 'organic-social' },
  { id: 'instagram', label: 'Instagram',        source: 'instagram', medium: 'organic-social' },
  { id: 'linkedin',  label: 'LinkedIn',         source: 'linkedin',  medium: 'organic-social' },
  { id: 'x',         label: 'X / Twitter',      source: 'x',         medium: 'organic-social' },
  { id: 'youtube',   label: 'YouTube',          source: 'youtube',   medium: 'organic-social' },
]

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

  useEffect(() => {
    refresh()
  }, [])

  function refresh() {
    setIsLoading(true)
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients'))
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
        const created = await createClient(form.name, form.slug, form.short_domain || undefined)
        setDialogOpen(false)
        refresh()
        // Open the setup wizard for the newly created client.
        setWizardClientId(created.id)
        setSelectedPlatforms(new Set())
        setPaidSocial(false)
        setWizardError(null)
        setWizardOpen(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete "${client.name}"? Links under this client will also be removed.`)) return
    try {
      await deleteClient(client.id)
      setClients((prev) => prev.filter((c) => c.id !== client.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete client')
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
      const selected = PLATFORMS.filter((p) => selectedPlatforms.has(p.id))

      // Derive unique sources and mediums from selected platforms.
      const sources = [...new Set(selected.map((p) => p.source))]
      const mediums = [...new Set(selected.map((p) => p.medium))]
      if (paidSocial) mediums.push('paid-social')

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={openCreate}>New client</Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients yet. Create one to get started.</p>
      ) : (
        <Table>
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
                <TableCell className="text-muted-foreground">{client.slug}</TableCell>
                <TableCell className="text-muted-foreground">
                  {client.short_domain || 'waygo.to'}
                </TableCell>
                <TableCell>
                  <Badge variant={client.is_active ? 'default' : 'secondary'}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(client)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(client)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit client' : 'New client'}</DialogTitle>
            <DialogDescription>
              Clients group links under a brand and can have their own short domain.
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up approved UTM values</DialogTitle>
            <DialogDescription>
              Pick the platforms you use. Waytrace will pre-load matching source and medium values so
              your team stays consistent. You can add more any time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {wizardError && (
              <Alert variant="destructive">
                <AlertDescription>{wizardError}</AlertDescription>
              </Alert>
            )}

            <p className="text-sm font-medium">Platforms</p>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selectedPlatforms.has(p.id)}
                    onChange={() => togglePlatform(p.id)}
                  />
                  {p.label}
                </label>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
              <input
                type="checkbox"
                className="accent-primary"
                checked={paidSocial}
                onChange={(e) => setPaidSocial(e.target.checked)}
              />
              Also use paid social (adds <code className="text-xs">paid-social</code> as a medium)
            </label>
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
