import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, QrCode as QrIcon, Upload } from 'lucide-react'
import {
  bulkCreateAssets,
  deleteAsset,
  getCollection,
  getGa4Analytics,
  getLinkHistory,
  listClients,
  renameCollection,
  updateAsset,
  updateLink,
  BULK_ROW_CAP,
  type CollectionAsset,
  type CollectionDetail,
  type DestinationHistoryEntry,
} from '@/lib/api'
import { normalizeDestinationUrl, scanUrl, shortUrl, slugify } from '@/lib/links'
import { useAuth } from '@/context/AuthContext'
import { QrDialog } from '@/components/QrDialog'
import { QrExportButton } from '@/components/QrExportButton'
import { CsvImport, type CsvColumn } from '@/components/CsvImport'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
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
function validateUrl(value: string): string | null {
  try {
    const u = new URL(normalizeDestinationUrl(value))
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Must be an http(s) URL'
  } catch {
    return 'Not a valid URL'
  }
}

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'sku', label: 'SKU', required: true, placeholder: 'SKYR-VAN-5.3' },
  { key: 'product_name', label: 'Product', required: true, placeholder: 'Vanilla Skyr' },
  { key: 'variant', label: 'Variant', placeholder: '5.3 oz' },
  { key: 'upc', label: 'UPC', placeholder: '850016377012' },
  { key: 'destination_url', label: 'Destination URL', required: true, placeholder: 'https://…', validate: validateUrl },
]

const CSV_TEMPLATE_EXAMPLES = [
  ['SKYR-VAN-5.3', 'Vanilla Skyr', '5.3 oz', '850016377012', 'https://example.com/products/vanilla-skyr'],
  ['SKYR-STR-5.3', 'Strawberry Skyr', '5.3 oz', '850016377029', 'https://example.com/products/strawberry-skyr'],
]

function fmtRevenue(v: number): string {
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** Per-link GA4 metrics for the grid columns, keyed by link_id. */
interface Ga4Columns {
  /** false = workspace has no GA4 property mapped (render the connect prompt). */
  mapped: boolean
  byLink: Map<number, { sessions: number; keyEvents: number; revenue: number }>
}

/**
 * Packaging collection detail: the SKU grid. Every row is one SKU = one
 * persistent short link (ga4_id = the SKU, so GA4 joins per SKU). CSV import
 * is all-or-nothing via the bulk endpoint. Destination edits go through the
 * existing link update endpoint (which records destination history).
 * GA4 Sessions/Key events/Revenue columns join the aggregate report's byLink
 * (keyed on link_id — GA4 matches sessionCampaignId to the stamped SKU) when
 * the workspace is mapped; "Export all QRs" zips one styled PNG per SKU
 * client-side (QrExportButton).
 */
export default function PackagingDetail() {
  const { id } = useParams()
  const collectionId = Number(id)
  const { canAdminister } = useAuth()

  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  // Shared UTM fields applied to every imported link (customer-set per §3 —
  // campaign is the initiative, never the SKU; utm_id/SKU is stamped server-side).
  const [utmSource, setUtmSource] = useState('packaging')
  const [utmMedium, setUtmMedium] = useState('qr')
  const [utmCampaign, setUtmCampaign] = useState('')

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrAsset, setQrAsset] = useState<CollectionAsset | null>(null)
  const [editAsset, setEditAsset] = useState<CollectionAsset | null>(null)
  // null = GA4 data unavailable (still loading, or a report error) → no
  // columns, no prompt, grid unchanged. Quiet degradation, like LinkDetail.
  const [ga4, setGa4] = useState<Ga4Columns | null>(null)

  const refresh = useCallback(() => {
    getCollection(collectionId)
      .then(setCollection)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load collection'))
      .finally(() => setIsLoading(false))
  }, [collectionId])

  useEffect(() => {
    if (Number.isInteger(collectionId)) refresh()
  }, [collectionId, refresh])

  // Per-SKU GA4 columns: the aggregate report's byLink already joins GA4
  // sessions on links.ga4_id (= the SKU) exactly, so the grid join is a
  // client-side Map lookup by link_id — no new Worker report pipeline.
  // Unmapped workspace → columns stay hidden and a connect prompt renders
  // below the grid; report errors → columns stay hidden, nothing else changes.
  const clientId = collection?.client_id
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    ;(async () => {
      try {
        const clients = await listClients()
        const workspace = clients.find((c) => c.id === clientId)
        if (!workspace?.ga4_property_id || !workspace?.ga4_connection_id) {
          if (!cancelled) setGa4({ mapped: false, byLink: new Map() })
          return
        }
        const report = await getGa4Analytics({ client_id: clientId })
        if (!cancelled)
          setGa4({
            mapped: true,
            byLink: new Map(report.byLink.map((r) => [r.link_id, r])),
          })
      } catch {
        if (!cancelled) setGa4(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function copy(text: string, tag: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(tag)
    setTimeout(() => setCopiedKey((k) => (k === tag ? null : k)), 1500)
  }

  async function handleRename() {
    if (!collection) return
    const name = prompt('Collection name', collection.name)?.trim()
    if (!name || name === collection.name) return
    try {
      await renameCollection(collection.id, name)
      setCollection((prev) => (prev ? { ...prev, name } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename collection')
    }
  }

  async function handleDeleteAsset(asset: CollectionAsset) {
    if (
      !confirm(
        `Delete SKU "${asset.sku}"? Its short link stops resolving immediately — a printed QR code for it will break.`
      )
    )
      return
    try {
      await deleteAsset(collectionId, asset.id)
      setCollection((prev) =>
        prev ? { ...prev, assets: prev.assets.filter((a) => a.id !== asset.id) } : prev
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset')
    }
  }

  const totals = useMemo(() => {
    const assets = collection?.assets ?? []
    return {
      scans: assets.reduce((s, a) => s + a.scans, 0),
      clicks: assets.reduce((s, a) => s + a.clicks, 0),
    }
  }, [collection])

  const showGa4 = ga4?.mapped === true

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading…</p>
  }
  if (!collection) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Collection not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" render={<RouterLink to="/dashboard/packaging" />}>
          <ArrowLeft className="size-4" />
          Back to Packaging
        </Button>
      </div>
    )
  }

  // ── CSV import flow (replaces the grid while active) ──────────────────────
  if (importing) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={collection.name}
          title="Import SKUs"
          description="Each row becomes one SKU with its own short link. Every row is validated first — nothing is created until the whole file passes."
        />
        <CsvImport
          columns={CSV_COLUMNS}
          uniqueKey="sku"
          templateFilename="waytrace-packaging-template.csv"
          templateExamples={CSV_TEMPLATE_EXAMPLES}
          entityLabel="SKU"
          cap={BULK_ROW_CAP}
          extras={
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="eyebrow-sm mb-3">UTM defaults for these links</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_source">UTM Source</Label>
                  <Input id="imp_source" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="packaging" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_medium">UTM Medium</Label>
                  <Input id="imp_medium" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="qr" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imp_campaign">UTM Campaign</Label>
                  <Input id="imp_campaign" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="skyr-launch-2026" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Campaign is the initiative, not the SKU — Waytrace stamps each link's SKU as{' '}
                <span className="mono">utm_id</span> automatically, which GA4 reads as its Campaign ID.
              </p>
            </div>
          }
          onSubmit={async (rows) => {
            const result = await bulkCreateAssets(
              collection.id,
              rows.map((r) => ({
                sku: r.sku,
                product_name: r.product_name,
                variant: r.variant || undefined,
                upc: r.upc || undefined,
                destination_url: normalizeDestinationUrl(r.destination_url),
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

  // ── SKU grid ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Packaging"
        title={collection.name}
        description={`${collection.assets.length} SKU${collection.assets.length === 1 ? '' : 's'} · ${totals.scans} scans · ${totals.clicks} clicks`}
        actions={
          <>
            <Button variant="outline" render={<RouterLink to="/dashboard/packaging" />}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {collection.assets.length > 0 && (
              <QrExportButton
                assets={collection.assets}
                nameFor={(a) => a.sku}
                zipName={`${slugify(collection.name) || 'packaging'}-qr-codes.zip`}
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
            No SKUs yet. Import a CSV to create a short link for every product.
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
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Short link</TableHead>
                <TableHead className="text-right">Scans</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                {showGa4 && <TableHead className="text-right">Sessions</TableHead>}
                {showGa4 && <TableHead className="text-right">Key events</TableHead>}
                {showGa4 && <TableHead className="text-right">Revenue</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collection.assets.map((asset) => {
                // Absent from byLink = mapped but no GA4 sessions matched this
                // SKU yet — a zero row, not an error.
                const ga4Row = ga4?.byLink.get(asset.link_id)
                return (
                <TableRow key={asset.id}>
                  <TableCell className="mono text-xs font-medium">{asset.sku}</TableCell>
                  <TableCell>{asset.product_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{asset.variant}</TableCell>
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
                  <TableCell className="mono text-right text-xs">{asset.scans}</TableCell>
                  <TableCell className="mono text-right text-xs">{asset.clicks}</TableCell>
                  {showGa4 && (
                    <TableCell className="mono text-right text-xs">
                      {(ga4Row?.sessions ?? 0).toLocaleString()}
                    </TableCell>
                  )}
                  {showGa4 && (
                    <TableCell className="mono text-right text-xs">
                      {(ga4Row?.keyEvents ?? 0).toLocaleString()}
                    </TableCell>
                  )}
                  {showGa4 && (
                    <TableCell className="mono text-right text-xs">
                      {fmtRevenue(ga4Row?.revenue ?? 0)}
                    </TableCell>
                  )}
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

      {ga4?.mapped === false && collection.assets.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-5">
          <span className="eyebrow">Post-click · Google Analytics</span>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect this workspace to a GA4 property to see sessions, key events, and revenue per
            SKU — each link's SKU is stamped as its GA4 Campaign ID automatically.
          </p>
          <RouterLink
            to="/dashboard/settings/integrations"
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3`}
          >
            Connect Google Analytics
          </RouterLink>
        </div>
      )}

      <QrDialog
        open={qrAsset != null}
        onOpenChange={(o) => !o && setQrAsset(null)}
        url={qrAsset ? scanUrl(qrAsset) : ''}
        label={qrAsset?.sku ?? undefined}
      />

      {editAsset && (
        <AssetEditDialog
          collectionId={collectionId}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => { setEditAsset(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Asset edit dialog: product fields + destination (with history) ──────────
// SKU edits re-stamp the link's ga4_id server-side (and the change is recorded
// in the link's history so the GA4 join break is never silent). Destination
// edits go through the existing link update endpoint, which writes
// link_destination_history.
function AssetEditDialog({
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
  const [sku, setSku] = useState(asset.sku ?? '')
  const [productName, setProductName] = useState(asset.product_name ?? '')
  const [variant, setVariant] = useState(asset.variant ?? '')
  const [upc, setUpc] = useState(asset.upc ?? '')
  const [destination, setDestination] = useState(asset.destination_url)
  const [history, setHistory] = useState<DestinationHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getLinkHistory(asset.link_id).then(setHistory).catch(() => setHistory([]))
  }, [asset.link_id])

  const skuChanged = sku.trim() !== (asset.sku ?? '')
  const destChanged = normalizeDestinationUrl(destination) !== asset.destination_url

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      // Asset fields first (SKU edit re-stamps ga4_id)…
      await updateAsset(collectionId, asset.id, {
        sku: sku.trim(),
        product_name: productName.trim(),
        variant: variant.trim() || undefined,
        upc: upc.trim() || undefined,
      })
      // …then the destination via the links endpoint (history + validation),
      // preserving the link's stored UTMs.
      if (destChanged) {
        await updateLink(asset.link_id, {
          destination_url: normalizeDestinationUrl(destination),
          utm_source: asset.utm_source ?? undefined,
          utm_medium: asset.utm_medium ?? undefined,
          utm_campaign: asset.utm_campaign ?? undefined,
          utm_term: asset.utm_term ?? undefined,
          utm_content: asset.utm_content ?? undefined,
          label: asset.label ?? undefined,
        })
      }
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
          <DialogTitle>Edit {asset.sku}</DialogTitle>
          <DialogDescription>
            The short link never changes — retarget the destination any time, even after printing.
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
              <Label htmlFor="ae_sku">SKU</Label>
              <Input id="ae_sku" required value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ae_name">Product</Label>
              <Input id="ae_name" required value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ae_variant">Variant</Label>
              <Input id="ae_variant" value={variant} onChange={(e) => setVariant(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ae_upc">UPC</Label>
              <Input id="ae_upc" value={upc} onChange={(e) => setUpc(e.target.value)} />
            </div>
          </div>

          {skuChanged && (
            <p className="rounded-md border border-border bg-cast p-3 text-xs text-muted-foreground">
              Changing the SKU updates this link's GA4 Campaign ID (<span className="mono">utm_id</span>).
              GA4 data recorded under the old SKU stays under the old SKU — the change is noted in the
              link's history.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="ae_dest">Destination URL</Label>
            <Input
              id="ae_dest"
              required
              type="text"
              inputMode="url"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

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
            <Button type="submit" disabled={isSaving || !sku.trim() || !productName.trim()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
