import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createCollection,
  deleteCollection,
  listClients,
  listCollections,
  type AssetCollection,
  type Client,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

/**
 * Packaging — Enterprise asset collections of type='product'. Each collection
 * is a packaging program (e.g. "2026 Packaging"); each asset inside is one SKU
 * carrying one persistent short link. Enterprise-only (nav is gated; the
 * Worker enforces the real gate). Contributors are read-only.
 */
export default function Packaging() {
  const { canAdminister } = useAuth()
  const navigate = useNavigate()

  const [collections, setCollections] = useState<AssetCollection[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([listCollections(), listClients()])
      .then(([cols, cls]) => {
        setCollections(cols.filter((c) => c.type === 'product'))
        setClients(cls)
        if (cls.length > 0) setClientId(String(cls[0].id))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load collections'))
      .finally(() => setIsLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const created = await createCollection({ client_id: Number(clientId), name: name.trim() })
      setDialogOpen(false)
      navigate(`/dashboard/packaging/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(col: AssetCollection) {
    if (
      !confirm(
        `Delete "${col.name}"? All ${col.asset_count ?? 0} of its short links stop resolving immediately — printed QR codes will break.`
      )
    )
      return
    try {
      await deleteCollection(col.id)
      setCollections((prev) => prev.filter((c) => c.id !== col.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Enterprise"
        title="Packaging"
        description="Collections of SKUs, each carrying a persistent short link. Print once — retarget the destination any time, and read per-SKU results in GA4."
        actions={
          canAdminister ? (
            <Button onClick={() => { setName(''); setDialogOpen(true) }} disabled={clients.length === 0}>
              New collection
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && collections.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            No packaging collections yet. Create one, then import your SKUs from a CSV.
          </p>
          {canAdminister && (
            <Button className="mt-4" onClick={() => { setName(''); setDialogOpen(true) }} disabled={clients.length === 0}>
              New collection
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="[&_td]:py-2 [&_th]:h-9">
            <TableHeader>
              <TableRow>
                <TableHead>Collection</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">SKUs</TableHead>
                <TableHead>Created</TableHead>
                {canAdminister && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((col) => (
                <TableRow
                  key={col.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dashboard/packaging/${col.id}`)}
                >
                  <TableCell className="font-medium">{col.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{col.client_name}</TableCell>
                  <TableCell className="mono text-right text-xs">{col.asset_count ?? 0}</TableCell>
                  <TableCell className="mono text-xs text-muted-foreground">
                    {new Date(col.created_at).toLocaleDateString()}
                  </TableCell>
                  {canAdminister && (
                    <TableCell className="text-right">
                      <Button
                        variant="destructive-ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(col) }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New packaging collection</DialogTitle>
            <DialogDescription>
              A collection groups the SKUs of one packaging program. Its links are stamped with the
              workspace's domain.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="col_name">Name</Label>
              <Input
                id="col_name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2026 Packaging"
              />
            </div>
            {clients.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="col_client">Workspace</Label>
                <Select value={clientId} onValueChange={(v) => setClientId(v ?? '')}>
                  <SelectTrigger id="col_client" className="w-full">
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim() || !clientId}>
                {isSubmitting ? 'Creating…' : 'Create collection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
