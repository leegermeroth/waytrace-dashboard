import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Check, Copy, QrCode as QrIcon, Search, X } from 'lucide-react'
import { deleteLink, listClients, listLinks, type Client, type Link } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatusDot } from '@/components/brand'
import { QrDialog } from '@/components/QrDialog'
import { buildTrackingUrl, scanUrl, shortUrl } from '@/lib/links'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SortKey = 'label' | 'clicks' | 'scans' | 'created_at'
type StatusFilter = 'all' | 'active' | 'inactive'

/** A quiet toggle chip for the boolean quick-filters. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.625rem] tracking-[0.08em] uppercase transition-colors',
        active
          ? 'border-ochre bg-ochre/10 text-ochre'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default function LinksList() {
  const [links, setLinks] = useState<Link[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [mediumFilter, setMediumFilter] = useState<string>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrLabel, setQrLabel] = useState('')

  useEffect(() => {
    Promise.all([listLinks(), listClients()])
      .then(([linksData, clientsData]) => {
        setLinks(linksData)
        setClients(clientsData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load links'))
      .finally(() => setIsLoading(false))
  }, [])

  // Distinct UTM values across the current links, for the dropdown filters.
  const distinct = useMemo(() => {
    const collect = (get: (l: Link) => string | null) => {
      const set = new Set<string>()
      for (const l of links) {
        const v = get(l)?.trim()
        if (v) set.add(v)
      }
      return [...set].sort((a, b) => a.localeCompare(b))
    }
    return {
      source: collect((l) => l.utm_source),
      medium: collect((l) => l.utm_medium),
      campaign: collect((l) => l.utm_campaign),
    }
  }, [links])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = links.filter((l) => {
      if (clientFilter !== 'all' && l.client_id !== Number(clientFilter)) return false
      if (sourceFilter !== 'all' && (l.utm_source || '') !== sourceFilter) return false
      if (mediumFilter !== 'all' && (l.utm_medium || '') !== mediumFilter) return false
      if (campaignFilter !== 'all' && (l.utm_campaign || '') !== campaignFilter) return false
      if (statusFilter === 'active' && !l.is_active) return false
      if (statusFilter === 'inactive' && l.is_active) return false
      if (q) {
        const hay = [
          l.label,
          l.short_code,
          l.destination_url,
          l.utm_source,
          l.utm_medium,
          l.utm_campaign,
          l.utm_term,
          l.utm_content,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'label') {
        cmp = (a.label || a.short_code).localeCompare(b.label || b.short_code)
      } else if (sortKey === 'clicks') {
        cmp = a.clicks - b.clicks
      } else if (sortKey === 'scans') {
        cmp = a.scans - b.scans
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [
    links,
    search,
    clientFilter,
    sourceFilter,
    mediumFilter,
    campaignFilter,
    statusFilter,
    sortKey,
    sortDir,
  ])

  const hasActiveFilters =
    search.trim() !== '' ||
    clientFilter !== 'all' ||
    sourceFilter !== 'all' ||
    mediumFilter !== 'all' ||
    campaignFilter !== 'all' ||
    statusFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setClientFilter('all')
    setSourceFilter('all')
    setMediumFilter('all')
    setCampaignFilter('all')
    setStatusFilter('all')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  async function copy(text: string, tag: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(tag)
    setTimeout(() => setCopiedKey((k) => (k === tag ? null : k)), 1500)
  }

  async function handleDelete(link: Link) {
    if (!confirm(`Delete "${link.label || link.short_code}"? This cannot be undone.`)) return
    try {
      await deleteLink(link.id)
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Link library"
        title="Links"
        description="Search, filter, and act on every saved tracking link."
        actions={<Button render={<RouterLink to="/dashboard/links/new" />}>New links</Button>}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search label, short code, destination, or UTM values…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {clients.length > 1 && (
            <Select value={clientFilter} onValueChange={(v) => setClientFilter(v ?? 'all')}>
              <SelectTrigger className="h-8 w-auto min-w-40">
                <SelectValue placeholder="All workspaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workspaces</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {distinct.source.length > 0 && (
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? 'all')}>
              <SelectTrigger className="h-8 w-auto min-w-32">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {distinct.source.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {distinct.medium.length > 0 && (
            <Select value={mediumFilter} onValueChange={(v) => setMediumFilter(v ?? 'all')}>
              <SelectTrigger className="h-8 w-auto min-w-32">
                <SelectValue placeholder="Medium" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mediums</SelectItem>
                {distinct.medium.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {distinct.campaign.length > 0 && (
            <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v ?? 'all')}>
              <SelectTrigger className="h-8 w-auto min-w-32">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {distinct.campaign.map((cg) => (
                  <SelectItem key={cg} value={cg}>
                    {cg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={statusFilter === 'active'}
            onClick={() => setStatusFilter((s) => (s === 'active' ? 'all' : 'active'))}
          >
            Active
          </FilterChip>
          <FilterChip
            active={statusFilter === 'inactive'}
            onClick={() => setStatusFilter((s) => (s === 'inactive' ? 'all' : 'inactive'))}
          >
            Inactive
          </FilterChip>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase hover:text-ochre"
            >
              <X className="size-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!isLoading && filtered.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            {links.length === 0
              ? 'No links yet. Saved links, their short URLs, and click history will appear here.'
              : 'No links match these filters.'}
          </p>
          {links.length === 0 ? (
            <Button className="mt-4" render={<RouterLink to="/dashboard/links/new" />}>
              Create your first link
            </Button>
          ) : (
            <Button variant="outline" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="[&_td]:py-2 [&_th]:h-9">
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('label')}>
                  Label
                </TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('clicks')}>
                  Clicks
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('scans')}>
                  Scans
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <RouterLink
                      to={`/dashboard/links/${link.id}`}
                      className="font-medium hover:text-ochre"
                    >
                      {link.label || link.short_code}
                    </RouterLink>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => copy(shortUrl(link), `short-${link.id}`)}
                      title={copiedKey === `short-${link.id}` ? 'Copied' : 'Click to copy short link'}
                      aria-label="Copy short link"
                      className="group/copy mono inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ochre"
                    >
                      {shortUrl(link).replace('https://', '')}
                      {copiedKey === `short-${link.id}` ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5 opacity-50 transition-opacity group-hover/copy:opacity-100" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <ValueCell value={link.utm_source} onClick={(v) => setSourceFilter(v)} />
                  </TableCell>
                  <TableCell>
                    <ValueCell value={link.utm_medium} onClick={(v) => setMediumFilter(v)} />
                  </TableCell>
                  <TableCell>
                    <ValueCell value={link.utm_campaign} onClick={(v) => setCampaignFilter(v)} />
                  </TableCell>
                  <TableCell className="mono">{link.clicks}</TableCell>
                  <TableCell className="mono">{link.scans}</TableCell>
                  <TableCell>
                    <StatusDot tone={link.is_active ? 'success' : 'neutral'}>
                      {link.is_active ? 'Active' : 'Inactive'}
                    </StatusDot>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Copy tracking URL"
                        aria-label="Copy tracking URL"
                        onClick={() => copy(buildTrackingUrl(link.destination_url, link), `track-${link.id}`)}
                      >
                        {copiedKey === `track-${link.id}` ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="QR code"
                        aria-label="QR code"
                        onClick={() => {
                          setQrUrl(scanUrl(link))
                          setQrLabel(link.label || link.short_code)
                        }}
                      >
                        <QrIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive-ghost"
                        size="sm"
                        onClick={() => handleDelete(link)}
                      >
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

      <QrDialog
        open={qrUrl != null}
        onOpenChange={(o) => !o && setQrUrl(null)}
        url={qrUrl || ''}
        label={qrLabel}
      />
    </div>
  )
}

/** A UTM value cell that filters to its own value on click, or an em dash. */
function ValueCell({
  value,
  onClick,
}: {
  value: string | null
  onClick: (v: string) => void
}) {
  const trimmed = value?.trim()
  if (!trimmed) return <span className="mono text-xs text-muted-foreground/50">—</span>
  return (
    <button
      onClick={() => onClick(trimmed)}
      title={`Filter by ${trimmed}`}
      className="mono cursor-pointer text-xs text-muted-foreground transition-colors hover:text-ochre"
    >
      {trimmed}
    </button>
  )
}
