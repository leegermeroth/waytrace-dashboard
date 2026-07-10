import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Check, Copy, Plus, QrCode as QrIcon, Trash2, Files as DuplicateIcon } from 'lucide-react'
import {
  createClient,
  createLink,
  listClients,
  type Client,
  type Link,
} from '@/lib/api'
import { UtmCombobox } from '@/components/UtmCombobox'
import { QrDialog } from '@/components/QrDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildTrackingUrl, normalizeDestinationUrl, runWithConcurrency, scanUrl, shortUrl } from '@/lib/links'

interface Row {
  key: number
  source: string
  medium: string
  destination: string
  label: string
  shortCode: string
}

interface RowResult {
  key: number
  destination: string
  link?: Link
  error?: string
}

let rowSeq = 0
function emptyRow(overrides: Partial<Row> = {}): Row {
  return { key: rowSeq++, source: '', medium: '', destination: '', label: '', shortCode: '', ...overrides }
}

// Fire a few creates at a time — enough to feel instant on a normal batch,
// gentle enough not to hammer the Worker. Partial success is reported per row.
const CONCURRENCY = 4

export default function BatchLinkForm() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [campaign, setCampaign] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<RowResult[] | null>(null)

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrLabel, setQrLabel] = useState<string>('')

  useEffect(() => {
    async function load() {
      try {
        let list = await listClients()
        if (list.length === 0) {
          const created = await createClient('My Links', `my-links-${Date.now().toString(36)}`)
          list = [created]
        }
        setClients(list)
        setClientId(String(list[0].id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function duplicateRow(key: number) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key)
      if (idx === -1) return prev
      const copy = emptyRow({ ...prev[idx] })
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  async function copy(text: string, tag: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(tag)
    setTimeout(() => setCopiedKey((k) => (k === tag ? null : k)), 1500)
  }

  const fillableRows = useMemo(() => rows.filter((r) => r.destination.trim()), [rows])

  async function handleSave() {
    setError(null)
    const toCreate = rows.filter((r) => r.destination.trim())
    if (toCreate.length === 0) {
      setError('Add at least one row with a destination URL.')
      return
    }
    setIsSaving(true)
    try {
      const settled = await runWithConcurrency(toCreate, CONCURRENCY, (row) =>
        createLink({
          client_id: Number(clientId),
          destination_url: normalizeDestinationUrl(row.destination),
          label: row.label.trim() || undefined,
          short_code: row.shortCode.trim() || undefined,
          utm_source: row.source.trim() || undefined,
          utm_medium: row.medium.trim() || undefined,
          utm_campaign: campaign.trim() || undefined,
        })
      )
      setResults(
        settled.map((s, i) => ({
          key: toCreate[i].key,
          destination: toCreate[i].destination.trim(),
          link: s.value,
          error: s.error instanceof Error ? s.error.message : s.error ? String(s.error) : undefined,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create links')
    } finally {
      setIsSaving(false)
    }
  }

  function startOver() {
    setResults(null)
    setRows([emptyRow()])
    setCampaign('')
  }

  // Return to the builder keeping only the rows that failed, so the user can fix
  // and re-submit them without re-creating (and duplicating) the ones that worked.
  function backToEditing(failedKeys: number[]) {
    setRows((prev) => {
      const remaining = prev.filter((r) => failedKeys.includes(r.key))
      return remaining.length ? remaining : [emptyRow()]
    })
    setResults(null)
  }

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading…</p>
  }

  // ── Results panel ─────────────────────────────────────────────────────────
  if (results) {
    const created = results.filter((r) => r.link)
    const failed = results.filter((r) => !r.link)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Batch created"
          title="Links created"
          description={`${created.length} created${failed.length ? `, ${failed.length} failed` : ''}${campaign ? ` · campaign “${campaign}”` : ''}.`}
          actions={
            <>
              {failed.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => backToEditing(failed.map((r) => r.key))}
                >
                  Fix {failed.length} failed
                </Button>
              ) : (
                <Button variant="outline" onClick={startOver}>
                  Create more
                </Button>
              )}
              <Button render={<RouterLink to="/dashboard/links" />}>Go to links</Button>
            </>
          }
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col divide-y divide-border">
            {results.map((r) => (
              <div key={r.key} className="flex flex-col gap-2 p-4">
                {r.link ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <RouterLink
                        to={`/dashboard/links/${r.link.id}`}
                        className="font-medium hover:text-ochre"
                      >
                        {r.link.label || r.link.short_code}
                      </RouterLink>
                      <StatusDot tone="success">Created</StatusDot>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copy(shortUrl(r.link!), `s-${r.key}`)}
                        title="Copy short link"
                        className="group/copy mono inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ochre"
                      >
                        {shortUrl(r.link).replace('https://', '')}
                        {copiedKey === `s-${r.key}` ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5 opacity-50 transition-opacity group-hover/copy:opacity-100" />
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy(buildTrackingUrl(r.link!.destination_url, r.link!), `t-${r.key}`)}
                      >
                        {copiedKey === `t-${r.key}` ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Copy tracking URL
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setQrUrl(scanUrl(r.link!))
                          setQrLabel(r.link!.label || r.link!.short_code)
                        }}
                      >
                        <QrIcon className="size-3.5" />
                        QR code
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="mono truncate text-xs text-muted-foreground">{r.destination}</span>
                      <StatusDot tone="danger">Failed</StatusDot>
                    </div>
                    <p className="text-xs text-destructive">{r.error || 'Unknown error'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <QrDialog
          open={qrUrl != null}
          onOpenChange={(o) => !o && setQrUrl(null)}
          url={qrUrl || ''}
          label={qrLabel}
        />
      </div>
    )
  }

  // ── Batch builder ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Build"
        title="New links"
        description="Build a batch of tracking links that share one campaign. Each row becomes its own saved link."
        actions={
          <Button variant="outline" render={<RouterLink to="/dashboard/links" />}>
            Cancel
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campaign</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {clients.length > 1 && (
            <div className="flex flex-col gap-2 sm:w-56">
              <Label>Workspace</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? '')}>
                <SelectTrigger className="w-full">
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
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="campaign">Campaign name</Label>
            <Input
              id="campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="summer-2026"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {rows.map((row, i) => {
          const preview = buildTrackingUrl(normalizeDestinationUrl(row.destination), {
            utm_source: row.source,
            utm_medium: row.medium,
            utm_campaign: campaign,
          })
          return (
            <Card key={row.key}>
              <CardContent className="flex flex-col gap-4 pt-6">
                <div className="flex items-center justify-between">
                  <span className="eyebrow-sm">Link {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateRow(row.key)}
                      title="Duplicate this row"
                    >
                      <DuplicateIcon className="size-3.5" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      title="Remove this row"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <UtmCombobox
                    id={`source-${row.key}`}
                    label="UTM Source"
                    clientId={clientId ? Number(clientId) : null}
                    field="utm_source"
                    value={row.source}
                    onChange={(v) => updateRow(row.key, { source: v })}
                    placeholder="facebook"
                  />
                  <UtmCombobox
                    id={`medium-${row.key}`}
                    label="UTM Medium"
                    clientId={clientId ? Number(clientId) : null}
                    field="utm_medium"
                    value={row.medium}
                    onChange={(v) => updateRow(row.key, { medium: v })}
                    placeholder="paid-social"
                    relatedSource={row.source}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`dest-${row.key}`}>Destination URL</Label>
                  <Input
                    id={`dest-${row.key}`}
                    type="text"
                    inputMode="url"
                    value={row.destination}
                    onChange={(e) => updateRow(row.key, { destination: e.target.value })}
                    placeholder="example.com/page"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`label-${row.key}`}>Label (optional)</Label>
                    <Input
                      id={`label-${row.key}`}
                      value={row.label}
                      onChange={(e) => updateRow(row.key, { label: e.target.value })}
                      placeholder="Spring hero button"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`code-${row.key}`}>Short code (optional)</Label>
                    <Input
                      id={`code-${row.key}`}
                      value={row.shortCode}
                      onChange={(e) => updateRow(row.key, { shortCode: e.target.value.toLowerCase() })}
                      placeholder="Auto-generated if blank"
                    />
                  </div>
                </div>

                <div className="dot-grid-well rounded-md border border-border px-3 py-2">
                  <span className="eyebrow-sm">Tracking URL preview</span>
                  <p className="mono mt-1 text-xs break-all text-muted-foreground">
                    {preview || <span className="text-muted-foreground/60">Enter a destination URL…</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          <Plus className="size-4" />
          Add another link
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving || fillableRows.length === 0}>
          {isSaving
            ? 'Creating…'
            : `Create ${fillableRows.length || ''} link${fillableRows.length === 1 ? '' : 's'}`.trim()}
        </Button>
      </div>
    </div>
  )
}
