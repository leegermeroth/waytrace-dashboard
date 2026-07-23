import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Nfc, QrCode as QrIcon, Upload } from 'lucide-react'
import {
  bulkCreateAssets,
  deleteAsset,
  getCollection,
  getLinkHistory,
  renameCollection,
  updateAsset,
  updateLink,
  BULK_ROW_CAP,
  VCARD_PLACEHOLDER_URL,
  type CollectionAsset,
  type CollectionDetail,
  type DestinationHistoryEntry,
  type PersonRowInput,
} from '@/lib/api'
import { nfcUrl, normalizeDestinationUrl, scanUrl, shortUrl, slugify } from '@/lib/links'
import { useAuth } from '@/context/AuthContext'
import { QrDialog } from '@/components/QrDialog'
import { QrExportButton } from '@/components/QrExportButton'
import { CsvImport, type CsvColumn } from '@/components/CsvImport'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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

/** Same http(s) check the Worker applies — catch it in the grid, not on submit. */
function validateOptionalUrl(value: string): string | null {
  if (!value.trim()) return null // blank = vCard mode, allowed
  try {
    const u = new URL(normalizeDestinationUrl(value))
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Must be an http(s) URL'
  } catch {
    return 'Not a valid URL'
  }
}

/** Mirrors the Worker's slug rule: lowercase [a-z0-9] runs, single hyphens. */
function validateSlug(value: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? null
    : 'Lowercase letters, numbers, and hyphens only (e.g. "katie-painter")'
}

function validateEmail(value: string): string | null {
  return /^\S+@\S+\.\S+$/.test(value) ? null : 'Not a valid email address'
}

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'person_name', label: 'Name', required: true, placeholder: 'Katie Painter' },
  // Not required in the CSV — a blank slug is auto-derived from the name.
  { key: 'person_slug', label: 'Slug', placeholder: 'auto from name', validate: validateSlug },
  { key: 'title', label: 'Title', placeholder: 'Co-Founder' },
  { key: 'email', label: 'Email', placeholder: 'katie@example.com', validate: validateEmail },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 000 1234' },
  { key: 'destination_url', label: 'Destination URL', placeholder: 'blank = vCard', validate: validateOptionalUrl },
]

const CSV_TEMPLATE_EXAMPLES = [
  ['Katie Painter', 'katie-painter', 'Co-Founder', 'katie@example.com', '+1 555 000 1234', ''],
  ['Hayley Painter', 'hayley-painter', 'Co-Founder', 'hayley@example.com', '', 'https://example.com/meet-hayley'],
]

/** Fill a blank slug from the name (applied on CSV parse and again on submit). */
function autoSlug(values: Record<string, string>): Record<string, string> {
  if (!values.person_slug?.trim() && values.person_name?.trim()) {
    return { ...values, person_slug: slugify(values.person_name) }
  }
  return values
}

/**
 * Team Cards roster: every row is one person = one persistent short link
 * (ga4_id = the person's slug, so GA4 joins per person on redirect-mode
 * cards). vCard mode serves a contact card at the short URL; redirect mode
 * 301s like any link. "Copy NFC" copies the ?nfc=1 URL for chip writing.
 * Taps = NFC hits; Scans = QR hits (the Worker keeps one scans counter,
 * split by link_clicks.via). Offboarding = retarget the destination or
 * deactivate the card (edit dialog).
 */
export default function CardsDetail() {
  const { id } = useParams()
  const collectionId = Number(id)
  const { canAdminister } = useAuth()

  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  // Shared UTM fields applied to every imported link — only meaningful for
  // redirect-mode cards (vCard hits never reach a destination site).
  const [utmSource, setUtmSource] = useState('card')
  const [utmMedium, setUtmMedium] = useState('qr')
  const [utmCampaign, setUtmCampaign] = useState('')

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrAsset, setQrAsset] = useState<CollectionAsset | null>(null)
  const [editAsset, setEditAsset] = useState<CollectionAsset | null>(null)

  const refresh = useCallback(() => {
    getCollection(collectionId)
      .then(setCollection)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load collection'))
      .finally(() => setIsLoading(false))
  }, [collectionId])

  useEffect(() => {
    if (Number.isInteger(collectionId)) refresh()
  }, [collectionId, refresh])

  async function copy(text: string, tag: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(tag)
    setTimeout(() => setCopiedKey((k) => (k === tag ? null : k)), 1500)
  }

  async function handleRename() {
    if (!collection) return
    const name = prompt('Roster name', collection.name)?.trim()
    if (!name || name === collection.name) return
    try {
      await renameCollection(collection.id, name)
      setCollection((prev) => (prev ? { ...prev, name } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename roster')
    }
  }

  async function handleDeleteAsset(asset: CollectionAsset) {
    if (
      !confirm(
        `Delete the card for "${asset.person_name}"? Its short link stops resolving immediately — printed cards and written NFC chips for it will break.`
      )
    )
      return
    try {
      await deleteAsset(collectionId, asset.id)
      setCollection((prev) =>
        prev ? { ...prev, assets: prev.assets.filter((a) => a.id !== asset.id) } : prev
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete card')
    }
  }

  /**
   * Row-level mode toggle. Switching to redirect while the link still holds
   * the vCard placeholder needs a real destination first — open the edit
   * dialog instead of letting the Worker bounce the call.
   */
  async function handleModeChange(asset: CollectionAsset, mode: 'redirect' | 'vcard') {
    if (mode === asset.destination_mode) return
    if (mode === 'redirect' && asset.destination_url === VCARD_PLACEHOLDER_URL) {
      setEditAsset(asset)
      return
    }
    setError(null)
    try {
      await updateAsset(collectionId, asset.id, { destination_mode: mode })
      setCollection((prev) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map((a) => (a.id === asset.id ? { ...a, destination_mode: mode } : a)),
            }
          : prev
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change card mode')
    }
  }

  const totals = useMemo(() => {
    const assets = collection?.assets ?? []
    const taps = assets.reduce((s, a) => s + (a.taps ?? 0), 0)
    const scans = assets.reduce((s, a) => s + a.scans, 0)
    return {
      taps,
      qrScans: Math.max(0, scans - taps),
      clicks: assets.reduce((s, a) => s + a.clicks, 0),
    }
  }, [collection])

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading…</p>
  }
  if (!collection) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Roster not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" render={<RouterLink to="/dashboard/cards" />}>
          <ArrowLeft className="size-4" />
          Back to Team Cards
        </Button>
      </div>
    )
  }

  // ── CSV import flow (replaces the roster while active) ────────────────────
  if (importing) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={collection.name}
          title="Import people"
          description="Each row becomes one card with its own short link. Rows with a destination URL become redirect cards; rows without become vCard cards (the link serves their contact card). Every row is validated first — nothing is created until the whole file passes."
        />
        <CsvImport
          columns={CSV_COLUMNS}
          uniqueKey="person_slug"
          templateFilename="waytrace-team-cards-template.csv"
          templateExamples={CSV_TEMPLATE_EXAMPLES}
          entityLabel="card"
          cap={BULK_ROW_CAP}
          transformRow={autoSlug}
          extras={
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="eyebrow-sm mb-3">UTM defaults for redirect-mode cards</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_source">UTM Source</Label>
                  <Input id="imp_source" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="card" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_medium">UTM Medium</Label>
                  <Input id="imp_medium" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="qr" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_campaign">UTM Campaign</Label>
                  <Input id="imp_campaign" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="team-cards-2026" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Waytrace stamps each person's slug as <span className="mono">utm_id</span> automatically,
                which GA4 reads as its Campaign ID. vCard cards never reach a website, so UTMs don't apply
                to them.
              </p>
            </div>
          }
          onSubmit={async (rows) => {
            const result = await bulkCreateAssets(
              collection.id,
              rows.map((r): PersonRowInput => ({
                person_name: r.person_name,
                person_slug: r.person_slug,
                title: r.title || undefined,
                email: r.email || undefined,
                phone: r.phone || undefined,
                // Mode is inferred by the Worker: URL present = redirect, blank = vCard.
                destination_url: r.destination_url ? normalizeDestinationUrl(r.destination_url) : undefined,
              })),
              {
                utm_source: utmSource.trim() || undefined,
                utm_medium: utmMedium.trim() || undefined,
                utm_campaign: utmCampaign.trim() || undefined,
              }
            )
            return { created: result.created }
          }}
          onDone={() => { setImporting(false); setIsLoading(true); refresh() }}
          onCancel={() => setImporting(false)}
        />
      </div>
    )
  }

  // ── Roster ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Team Cards"
        title={collection.name}
        description={`${collection.assets.length} ${collection.assets.length === 1 ? 'person' : 'people'} · ${totals.taps} taps · ${totals.qrScans} scans · ${totals.clicks} clicks`}
        actions={
          <>
            <Button variant="outline" render={<RouterLink to="/dashboard/cards" />}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {collection.assets.length > 0 && (
              <QrExportButton
                assets={collection.assets}
                nameFor={(a) => a.person_slug}
                zipName={`${slugify(collection.name) || 'team-cards'}-qr-codes.zip`}
                onError={setError}
              />
            )}
            {canAdminister && (
              <>
                <Button variant="outline" onClick={handleRename}>
                  Rename
                </Button>
                <Button onClick={() => setImporting(true)}>
                  <Upload className="size-4" />
                  Import CSV
                </Button>
              </>
            )}
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {collection.assets.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            No cards yet. Import a CSV to create a short link for every person on the team.
          </p>
          {canAdminister && (
            <Button className="mt-4" onClick={() => setImporting(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="[&_td]:py-2 [&_th]:h-9">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Short link</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right" title="NFC chip taps">Taps</TableHead>
                <TableHead className="text-right" title="QR code scans">Scans</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collection.assets.map((asset) => {
                const taps = asset.taps ?? 0
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.person_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{asset.title}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => copy(shortUrl(asset), `s-${asset.id}`)}
                        title="Copy short link"
                        className="group/copy mono inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ochre"
                      >
                        {shortUrl(asset).replace('https://', '')}
                        {copiedKey === `s-${asset.id}` ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5 opacity-50 transition-opacity group-hover/copy:opacity-100" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      {canAdminister ? (
                        <Select
                          value={asset.destination_mode}
                          onValueChange={(v) => handleModeChange(asset, v as 'redirect' | 'vcard')}
                        >
                          {/* Explicit label — Base UI's SelectValue falls back to the raw value. */}
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <span className="flex flex-1 text-left">
                              {asset.destination_mode === 'vcard' ? 'vCard' : 'Redirect'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vcard">vCard</SelectItem>
                            <SelectItem value="redirect">Redirect</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {asset.destination_mode === 'vcard' ? 'vCard' : 'Redirect'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="mono text-right text-xs">{taps}</TableCell>
                    <TableCell className="mono text-right text-xs">{Math.max(0, asset.scans - taps)}</TableCell>
                    <TableCell className="mono text-right text-xs">{asset.clicks}</TableCell>
                    <TableCell>
                      <StatusDot tone={asset.is_active ? 'success' : 'neutral'}>
                        {asset.is_active ? 'Live' : 'Off'}
                      </StatusDot>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setQrAsset(asset)} title="QR code">
                          <QrIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy(nfcUrl(asset), `n-${asset.id}`)}
                          title="Copy NFC URL (write this to the chip)"
                        >
                          {copiedKey === `n-${asset.id}` ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Nfc className="size-3.5" />
                          )}
                        </Button>
                        {canAdminister && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditAsset(asset)}>
                              Edit
                            </Button>
                            <Button
                              variant="destructive-ghost"
                              size="sm"
                              onClick={() => handleDeleteAsset(asset)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <QrDialog
        open={qrAsset != null}
        onOpenChange={(o) => !o && setQrAsset(null)}
        url={qrAsset ? scanUrl(qrAsset) : ''}
        label={qrAsset?.person_slug ?? undefined}
      />

      {editAsset && (
        <PersonEditDialog
          collectionId={collectionId}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => { setEditAsset(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Card edit dialog: person fields + mode + destination + active toggle ────
// Slug edits re-stamp the link's ga4_id server-side (recorded in the link's
// history so the GA4 join break is never silent). Destination and active
// edits go through the existing link update endpoint (which writes
// link_destination_history). Offboarding lives here: retarget the
// destination, or deactivate the card so its short link stops resolving.
function PersonEditDialog({
  collectionId,
  asset,
  onClose,
  onSaved,
}: {
  collectionId: number
  asset: CollectionAsset
  onClose: () => void
  onSaved: () => void
}) {
  const [personName, setPersonName] = useState(asset.person_name ?? '')
  const [personSlug, setPersonSlug] = useState(asset.person_slug ?? '')
  const [title, setTitle] = useState(asset.title ?? '')
  const [email, setEmail] = useState(asset.email ?? '')
  const [phone, setPhone] = useState(asset.phone ?? '')
  const [mode, setMode] = useState<'redirect' | 'vcard'>(asset.destination_mode)
  // The placeholder is a Worker artifact ("no real destination yet") — show
  // the field empty instead of leaking it.
  const [destination, setDestination] = useState(
    asset.destination_url === VCARD_PLACEHOLDER_URL ? '' : asset.destination_url
  )
  const [isActive, setIsActive] = useState(asset.is_active === 1)
  const [history, setHistory] = useState<DestinationHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getLinkHistory(asset.link_id).then(setHistory).catch(() => setHistory([]))
  }, [asset.link_id])

  const slugChanged = personSlug.trim() !== (asset.person_slug ?? '')
  const normalizedDest = destination.trim() ? normalizeDestinationUrl(destination) : ''
  const storedDest = asset.destination_url === VCARD_PLACEHOLDER_URL ? '' : asset.destination_url
  const destChanged = normalizedDest !== storedDest
  const activeChanged = isActive !== (asset.is_active === 1)
  const needsDestination = mode === 'redirect' && !normalizedDest

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      // Destination / active first via the links endpoint (history +
      // validation) so a vcard→redirect switch already has its real
      // destination in place when the mode lands on the asset.
      if ((destChanged && normalizedDest) || activeChanged) {
        await updateLink(asset.link_id, {
          destination_url: normalizedDest || asset.destination_url,
          is_active: isActive,
          utm_source: asset.utm_source ?? undefined,
          utm_medium: asset.utm_medium ?? undefined,
          utm_campaign: asset.utm_campaign ?? undefined,
          utm_term: asset.utm_term ?? undefined,
          utm_content: asset.utm_content ?? undefined,
          label: asset.label ?? undefined,
        })
      }
      // Then the person fields + mode ('' clears an optional field).
      await updateAsset(collectionId, asset.id, {
        person_name: personName.trim(),
        person_slug: personSlug.trim(),
        title: title.trim(),
        email: email.trim(),
        phone: phone.trim(),
        destination_mode: mode,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {asset.person_name}</DialogTitle>
          <DialogDescription>
            The short link never changes — printed cards and NFC chips keep working through any edit.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_name">Name</Label>
              <Input id="pe_name" required value={personName} onChange={(e) => setPersonName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_slug">Slug</Label>
              <Input id="pe_slug" required value={personSlug} onChange={(e) => setPersonSlug(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_title">Title</Label>
              <Input id="pe_title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_email">Email</Label>
              <Input id="pe_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_phone">Phone</Label>
              <Input id="pe_phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pe_mode">Card mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'redirect' | 'vcard')}>
                {/* Explicit label — Base UI's SelectValue falls back to the raw value. */}
                <SelectTrigger id="pe_mode" className="w-full">
                  <span className="flex flex-1 text-left">
                    {mode === 'vcard' ? 'vCard (serve contact card)' : 'Redirect (send to a URL)'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vcard">vCard (serve contact card)</SelectItem>
                  <SelectItem value="redirect">Redirect (send to a URL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {slugChanged && (
            <p className="rounded-md border border-border bg-cast p-3 text-xs text-muted-foreground">
              Changing the slug updates this card's GA4 Campaign ID (<span className="mono">utm_id</span>)
              and its vCard filename. GA4 data recorded under the old slug stays under the old slug — the
              change is noted in the link's history.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="pe_dest">
              Destination URL{mode === 'vcard' ? ' (used when switched to redirect)' : ''}
            </Label>
            <Input
              id="pe_dest"
              required={mode === 'redirect'}
              type="text"
              inputMode="url"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={mode === 'vcard' ? 'Optional' : 'https://…'}
            />
            {needsDestination && (
              <p className="text-xs text-destructive">Redirect mode needs a destination URL.</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 accent-ochre"
            />
            Card active
            <span className="text-xs text-muted-foreground">
              — deactivating stops the short link from resolving (offboarding)
            </span>
          </label>

          {history.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="eyebrow-sm">History</span>
              <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-cast p-3">
                {history.map((h) => (
                  <div key={h.id} className="text-xs text-muted-foreground">
                    <span className="mono">{new Date(h.changed_at).toLocaleDateString()}</span>{' '}
                    <span className="break-all">{h.old_destination}</span> →{' '}
                    <span className="break-all text-foreground">{h.new_destination}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !personName.trim() || !personSlug.trim() || needsDestination}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
