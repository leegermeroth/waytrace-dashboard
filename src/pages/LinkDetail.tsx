import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { Check, Copy, QrCode as QrIcon } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  createVariant,
  deleteLink,
  deleteVariant,
  getLinkGa4,
  getLinkHistory,
  getLinkStats,
  getVariantStats,
  listLinks,
  updateVariant,
  type DestinationHistoryEntry,
  type Ga4DimensionRow,
  type Ga4LinkReport,
  type Link,
  type LinkStats,
  type VariantWithStats,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, StatCard } from '@/components/brand'
import { QrDialog } from '@/components/QrDialog'
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
import { buildTrackingUrl, normalizeDestinationUrl, scanUrl, shortUrl } from '@/lib/links'

/**
 * The Worker only started rejecting non-http(s) destination_url values
 * recently — this guards against rendering a `javascript:` (or other
 * dangerous-scheme) URL as a live, clickable link for any row written
 * before that validation existed, or written directly to D1.
 */
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export default function LinkDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [link, setLink] = useState<Link | null>(null)
  const [stats, setStats] = useState<LinkStats | null>(null)
  const [ga4, setGa4] = useState<Ga4LinkReport | null>(null)
  const [history, setHistory] = useState<DestinationHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [trackingCopied, setTrackingCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([listLinks(), getLinkStats(Number(id)), getLinkHistory(Number(id))])
      .then(([links, statsData, historyData]) => {
        const found = links.find((l) => l.id === Number(id))
        if (!found) {
          setError('Link not found')
        } else {
          setLink(found)
        }
        setStats(statsData)
        setHistory(historyData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load link'))
      .finally(() => setIsLoading(false))
    // GA4 is a slower best-effort side channel — never blocks the page.
    getLinkGa4(Number(id))
      .then(setGa4)
      .catch(() => setGa4(null))
  }, [id])

  async function handleCopy() {
    if (!link) return
    await navigator.clipboard.writeText(shortUrl(link))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleCopyTracking() {
    if (!link) return
    await navigator.clipboard.writeText(buildTrackingUrl(link.destination_url, link))
    setTrackingCopied(true)
    setTimeout(() => setTrackingCopied(false), 1500)
  }

  async function handleDelete() {
    if (!link) return
    if (!confirm(`Delete "${link.label || link.short_code}"? This cannot be undone.`)) return
    try {
      await deleteLink(link.id)
      navigate('/dashboard/links')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link')
    }
  }

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading…</p>
  }

  if (error || !link) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error || 'Link not found'}</AlertDescription>
      </Alert>
    )
  }

  const utmParams = [
    ['Source', link.utm_source],
    ['Medium', link.utm_medium],
    ['Campaign', link.utm_campaign],
    ['Term', link.utm_term],
    ['Content', link.utm_content],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Link detail"
        title={link.label || link.short_code}
        actions={
          <>
            <Button variant="outline" onClick={() => setQrOpen(true)}>
              <QrIcon className="size-3.5" />
              QR code
            </Button>
            <Button variant="outline" render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}>
              Edit
            </Button>
            <Button variant="destructive-ghost" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow-sm">Short URL</span>
            <button
              onClick={handleCopy}
              title={copied ? 'Copied' : 'Click to copy'}
              aria-label="Copy short link"
              className="group/copy mono inline-flex cursor-pointer items-center gap-1.5 text-ochre hover:text-ochre-hover"
            >
              {shortUrl(link)}
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5 opacity-50 transition-opacity group-hover/copy:opacity-100" />
              )}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="eyebrow-sm">Destination</span>{' '}
            {isSafeHttpUrl(link.destination_url) ? (
              <a
                href={link.destination_url}
                target="_blank"
                rel="noreferrer"
                className="mono truncate text-xs text-muted-foreground hover:text-ochre"
              >
                {link.destination_url}
              </a>
            ) : (
              <span className="mono text-xs text-destructive">
                {link.destination_url} (unsafe URL, not clickable)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow-sm">Tracking URL</span>
            <button
              onClick={handleCopyTracking}
              title={trackingCopied ? 'Copied' : 'Click to copy'}
              aria-label="Copy tracking URL"
              className="group/copy mono inline-flex max-w-full cursor-pointer items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-ochre"
            >
              <span className="truncate">
                {buildTrackingUrl(link.destination_url, link).replace('https://', '')}
              </span>
              {trackingCopied ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : (
                <Copy className="size-3.5 shrink-0 opacity-50 transition-opacity group-hover/copy:opacity-100" />
              )}
            </button>
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="eyebrow-sm">Link clicks</span>
              <span className="mono text-foreground">{link.clicks}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="eyebrow-sm">QR scans</span>
              <span className="mono text-foreground">{link.scans}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="eyebrow-sm">Created</span>
              <span className="mono text-muted-foreground">
                {new Date(link.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity over time</CardTitle>
          <CardDescription>Clicks and scans, last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {stats && stats.clicksByDay.length > 0 ? (
            <div className="dot-grid-well h-64 rounded-md border border-border p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.clicksByDay} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--slate)' }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--slate)' }}
                    stroke="var(--border)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--foreground)',
                    }}
                    labelStyle={{ color: 'var(--slate)' }}
                    cursor={{ stroke: 'var(--ochre)', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-1)"
                    strokeWidth={1.8}
                    dot={{ r: 2.5, fill: 'var(--chart-1)', stroke: 'none' }}
                    activeDot={{ r: 4, fill: 'var(--chart-1)', stroke: 'var(--card)', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="font-serif text-sm text-muted-foreground italic">No click data yet.</p>
          )}
        </CardContent>
      </Card>

      {ga4 && <Ga4LinkPanel ga4={ga4} />}

      <VariantsPanel linkId={link.id} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>UTM parameters</CardTitle>
          </CardHeader>
          <CardContent>
            {utmParams.length > 0 ? (
              <ul className="flex flex-col text-sm">
                {utmParams.map(([key, value]) => (
                  <li key={key} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                    <span className="eyebrow-sm">{key}</span>
                    <span className="mono truncate text-foreground">{value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-serif text-sm text-muted-foreground italic">No UTM parameters set.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clicks by country</CardTitle>
          </CardHeader>
          <CardContent>
            {stats && stats.byCountry.length > 0 ? (
              <ul className="flex flex-col text-sm">
                {stats.byCountry.map((row) => (
                  <li
                    key={row.country}
                    className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0"
                  >
                    <span className="mono text-muted-foreground">{row.country}</span>
                    <span className="mono text-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-serif text-sm text-muted-foreground italic">No click data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Destination history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 border-b pb-3 last:border-0 last:pb-0">
                  <span className="text-muted-foreground text-xs">
                    {new Date(entry.changed_at).toLocaleString()}
                  </span>
                  <span className="line-through text-muted-foreground truncate">{entry.old_destination}</span>
                  <span className="font-medium truncate">{entry.new_destination}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <QrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={scanUrl(link)}
        label={link.label || link.short_code}
      />
    </div>
  )
}

/** Format GA4 revenue (property currency unknown — shown as USD, refine later). */
function fmtRevenue(v: number): string {
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** Same http(s) check the Worker applies — catch it in the dialog, not on submit. */
function validateVariantUrl(value: string): string | null {
  try {
    const u = new URL(normalizeDestinationUrl(value))
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Must be an http(s) URL'
  } catch {
    return 'Not a valid URL'
  }
}

/**
 * A/B testing panel (enterprise, v1.27). Lists the link's weighted destination
 * variants with per-variant hit stats (clicks / scans from
 * link_clicks.variant_id) and, when GA4 is connected, per-variant sessions/
 * key events/revenue joined on the variant's utm_content stamp
 * (sessionManualAdContent). Weight shows as its effective % of the active
 * total. While any variant is active, the link's utm_content field is locked
 * (the Worker rejects edits; LinkForm disables the input).
 *
 * Gate mirrors the Worker: enterprise tier only (panel simply doesn't render
 * otherwise); contributors see it read-only.
 */
function VariantsPanel({ linkId }: { linkId: number }) {
  const { isEnterprise, canAdminister } = useAuth()
  const [variants, setVariants] = useState<VariantWithStats[]>([])
  const [noVariant, setNoVariant] = useState<{ clicks: number; scans: number } | null>(null)
  const [ga4ByStamp, setGa4ByStamp] = useState<Map<string, Ga4DimensionRow> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<VariantWithStats | null>(null)

  const refresh = useCallback(() => {
    getVariantStats(linkId)
      .then((stats) => {
        setVariants(stats.variants)
        setNoVariant(stats.no_variant)
        setLoaded(true)
      })
      .catch(() => setLoaded(false)) // non-enterprise 403 etc. — hide the panel
  }, [linkId])

  useEffect(() => {
    if (isEnterprise) refresh()
  }, [isEnterprise, refresh])

  // GA4 per-variant is a slower best-effort side channel, only worth a round
  // trip once we know variants exist.
  useEffect(() => {
    if (!loaded || variants.length === 0) return
    getLinkGa4(linkId, undefined, undefined, 'variant')
      .then((report) => {
        if (report.available && report.byContent) {
          setGa4ByStamp(new Map(report.byContent.map((r) => [r.key, r])))
        }
      })
      .catch(() => setGa4ByStamp(null))
    // Re-fetch only when the variant set changes size (a new stamp may exist).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, variants.length, linkId])

  if (!isEnterprise || !loaded) return null

  const activeTotal = variants.filter((v) => v.is_active === 1).reduce((s, v) => s + v.weight, 0)
  const showGa4 = ga4ByStamp !== null
  const showRemainder =
    noVariant !== null && variants.length > 0 && noVariant.clicks + noVariant.scans > 0

  async function handleDelete(v: VariantWithStats) {
    if (!confirm(`Delete variant "${v.label}"? Its hits stay counted under "No variant".`)) return
    try {
      await deleteVariant(linkId, v.id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete variant')
    }
  }

  async function handleToggleActive(v: VariantWithStats) {
    try {
      await updateVariant(linkId, v.id, { is_active: v.is_active !== 1 })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update variant')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <CardTitle>A/B testing</CardTitle>
            <CardDescription>
              Weighted destination variants. Each hit picks a variant by weight and stamps its
              content tag, so GA4 splits results per variant automatically.
            </CardDescription>
          </div>
          {canAdminister && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              Add variant
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {variants.length === 0 ? (
          <p className="font-serif text-sm text-muted-foreground italic">
            No variants yet. Add two or more to split this link's traffic between destinations.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Split</TableHead>
                  <TableHead>Content tag</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                  {showGa4 && <TableHead className="text-right">Sessions</TableHead>}
                  {showGa4 && <TableHead className="text-right">Key events</TableHead>}
                  {showGa4 && <TableHead className="text-right">Revenue</TableHead>}
                  {canAdminister && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => {
                  const ga4Row = ga4ByStamp?.get(v.utm_content)
                  const pct =
                    v.is_active === 1 && activeTotal > 0
                      ? `${Math.round((v.weight / activeTotal) * 100)}%`
                      : '—'
                  return (
                    <TableRow key={v.id} className={v.is_active !== 1 ? 'opacity-50' : undefined}>
                      <TableCell className="font-medium">
                        {v.label}
                        {v.is_active !== 1 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(paused)</span>
                        )}
                      </TableCell>
                      <TableCell className="mono max-w-56 truncate text-xs text-muted-foreground">
                        {v.destination_url}
                      </TableCell>
                      <TableCell className="mono text-right" title={`weight ${v.weight}`}>
                        {pct}
                      </TableCell>
                      <TableCell className="mono text-xs text-muted-foreground">
                        {v.utm_content}
                      </TableCell>
                      <TableCell className="mono text-right">{v.clicks}</TableCell>
                      <TableCell className="mono text-right">{v.scans}</TableCell>
                      {showGa4 && (
                        <TableCell className="mono text-right">
                          {(ga4Row?.sessions ?? 0).toLocaleString()}
                        </TableCell>
                      )}
                      {showGa4 && (
                        <TableCell className="mono text-right">
                          {(ga4Row?.keyEvents ?? 0).toLocaleString()}
                        </TableCell>
                      )}
                      {showGa4 && (
                        <TableCell className="mono text-right">
                          {fmtRevenue(ga4Row?.revenue ?? 0)}
                        </TableCell>
                      )}
                      {canAdminister && (
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => handleToggleActive(v)}>
                            {v.is_active === 1 ? 'Pause' : 'Resume'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(v)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="destructive-ghost" size="sm" onClick={() => handleDelete(v)}>
                            Delete
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {showRemainder && noVariant && (
                  <TableRow>
                    <TableCell className="text-muted-foreground italic">No variant</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Hits before A/B, while paused, or from deleted variants
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="mono text-right">{noVariant.clicks}</TableCell>
                    <TableCell className="mono text-right">{noVariant.scans}</TableCell>
                    {showGa4 && <TableCell className="text-right">—</TableCell>}
                    {showGa4 && <TableCell className="text-right">—</TableCell>}
                    {showGa4 && <TableCell className="text-right">—</TableCell>}
                    {canAdminister && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {variants.some((v) => v.is_active === 1) && (
          <p className="mt-3 text-xs text-muted-foreground">
            While variants are active, this link's UTM Content is managed by A/B testing — the
            variant's content tag is stamped on every redirect.
          </p>
        )}
      </CardContent>

      <VariantDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        linkId={linkId}
        variant={editing}
        onSaved={() => {
          setDialogOpen(false)
          refresh()
        }}
      />
    </Card>
  )
}

/** Add/edit dialog. The utm_content stamp is server-generated and immutable. */
function VariantDialog({
  open,
  onOpenChange,
  linkId,
  variant,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  linkId: number
  variant: VariantWithStats | null
  onSaved: () => void
}) {
  const [label, setLabel] = useState(variant?.label ?? '')
  const [destination, setDestination] = useState(variant?.destination_url ?? '')
  const [weight, setWeight] = useState(String(variant?.weight ?? 50))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const urlError = validateVariantUrl(destination)
    if (urlError) {
      setError(urlError)
      return
    }
    const weightNum = Number(weight)
    if (!Number.isInteger(weightNum) || weightNum < 1) {
      setError('Weight must be a positive whole number')
      return
    }

    setIsSubmitting(true)
    try {
      const input = {
        label: label.trim(),
        destination_url: normalizeDestinationUrl(destination),
        weight: weightNum,
      }
      if (variant) {
        await updateVariant(linkId, variant.id, input)
      } else {
        await createVariant(linkId, input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save variant')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant ? `Edit variant — ${variant.label}` : 'Add variant'}</DialogTitle>
          <DialogDescription>
            {variant
              ? `Content tag "${variant.utm_content}" is permanent — GA4 history joins on it.`
              : 'A content tag (variant-a, variant-b, …) is assigned automatically and stamped on every redirect this variant serves.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant_label">Label</Label>
            <Input
              id="variant_label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Landing page A"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant_destination">Destination URL</Label>
            <Input
              id="variant_destination"
              type="text"
              inputMode="url"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="example.com/landing-a"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant_weight">Weight</Label>
            <Input
              id="variant_weight"
              type="number"
              min={1}
              step={1}
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Relative share — a 80 / 20 pair sends ~80% of hits to the first variant.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : variant ? 'Save changes' : 'Add variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Post-click GA4 metrics for this link. Renders nothing on error / no UTMs. */
function Ga4LinkPanel({ ga4 }: { ga4: Ga4LinkReport }) {
  if (ga4.reason === 'error' || ga4.reason === 'no_utms') return null

  // Workspace not mapped to a GA4 property — a quiet connect prompt.
  if (!ga4.available) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-start gap-2 py-5">
          <span className="eyebrow">Post-click · Google Analytics</span>
          <p className="text-sm text-muted-foreground">
            Connect this workspace to a GA4 property to see the sessions, key events, and revenue this link drove.
          </p>
          <RouterLink to="/dashboard/settings/integrations" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Connect Google Analytics
          </RouterLink>
        </CardContent>
      </Card>
    )
  }

  const t = ga4.totals ?? { sessions: 0, engagedSessions: 0, keyEvents: 0, revenue: 0 }
  const empty = t.sessions === 0 && t.keyEvents === 0 && t.revenue === 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-click · Google Analytics</CardTitle>
        <CardDescription>
          Matched to this link's UTMs{ga4.property_name ? ` · ${ga4.property_name}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="font-serif text-sm text-muted-foreground italic">
            No GA4 sessions have matched this link's UTMs yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Sessions" value={t.sessions.toLocaleString()} />
            <StatCard label="Engaged" value={t.engagedSessions.toLocaleString()} />
            <StatCard label="Key events" value={t.keyEvents.toLocaleString()} />
            <StatCard label="Revenue" value={fmtRevenue(t.revenue)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
