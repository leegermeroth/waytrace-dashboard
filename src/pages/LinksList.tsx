import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import { deleteLink, listClients, listLinks, type Client, type Link } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SortKey = 'label' | 'clicks' | 'created_at'

export default function LinksList() {
  const [links, setLinks] = useState<Link[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([listLinks(), listClients()])
      .then(([linksData, clientsData]) => {
        setLinks(linksData)
        setClients(clientsData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load links'))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = links
    if (clientFilter !== 'all') {
      result = result.filter((l) => l.client_id === Number(clientFilter))
    }
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'label') {
        cmp = (a.label || a.short_code).localeCompare(b.label || b.short_code)
      } else if (sortKey === 'clicks') {
        cmp = a.clicks - b.clicks
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [links, clientFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function shortUrl(link: Link) {
    const domain = link.short_domain || 'waygo.to'
    return `https://${domain}/${link.short_code}`
  }

  async function handleCopy(link: Link) {
    await navigator.clipboard.writeText(shortUrl(link))
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(null), 1500)
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
        description="Every saved tracking link, with its short URL, destination, and clicks."
        actions={<Button render={<RouterLink to="/dashboard/links/new" />}>New link</Button>}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {clients.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="eyebrow-sm">Filter by workspace</span>
          <Select value={clientFilter} onValueChange={(v) => setClientFilter(v ?? 'all')}>
            <SelectTrigger>
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
        </div>
      )}

      {!isLoading && filtered.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            No links yet. Saved links, their short URLs, and click history will appear here.
          </p>
          <Button className="mt-4" render={<RouterLink to="/dashboard/links/new" />}>
            Create your first link
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="[&_td]:py-2 [&_th]:h-9">
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('label')}>
                  Label
                </TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('clicks')}>
                  Clicks
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <RouterLink to={`/dashboard/links/${link.id}`} className="font-medium hover:text-ochre">
                      {link.label || link.short_code}
                    </RouterLink>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleCopy(link)}
                      title={copiedId === link.id ? 'Copied' : 'Click to copy'}
                      aria-label="Copy short link"
                      className="group/copy mono inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ochre"
                    >
                      {shortUrl(link).replace('https://', '')}
                      {copiedId === link.id ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5 opacity-50 transition-opacity group-hover/copy:opacity-100" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="mono max-w-64 truncate text-xs text-muted-foreground">
                    {link.destination_url}
                  </TableCell>
                  <TableCell className="mono">{link.clicks}</TableCell>
                  <TableCell>
                    <StatusDot tone={link.is_active ? 'success' : 'neutral'}>
                      {link.is_active ? 'Active' : 'Inactive'}
                    </StatusDot>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}
                      >
                        Edit
                      </Button>
                      <Button variant="destructive-ghost" size="sm" onClick={() => handleDelete(link)}>
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
    </div>
  )
}
