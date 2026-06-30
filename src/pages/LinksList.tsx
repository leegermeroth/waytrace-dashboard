import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { deleteLink, listClients, listLinks, type Client, type Link } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Links</h1>
        <Button render={<RouterLink to="/dashboard/links/new" />}>New link</Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {clients.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by client:</span>
          <Select value={clientFilter} onValueChange={(v) => setClientFilter(v ?? 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
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
        <p className="text-sm text-muted-foreground">
          No links yet.{' '}
          <RouterLink to="/dashboard/links/new" className="underline">
            Create your first link
          </RouterLink>
          .
        </p>
      ) : (
        <Table>
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
                  <RouterLink to={`/dashboard/links/${link.id}`} className="font-medium hover:underline">
                    {link.label || link.short_code}
                  </RouterLink>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleCopy(link)}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {copiedId === link.id ? 'Copied!' : shortUrl(link).replace('https://', '')}
                  </button>
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {link.destination_url}
                </TableCell>
                <TableCell>{link.clicks}</TableCell>
                <TableCell>
                  <Badge variant={link.is_active ? 'default' : 'secondary'}>
                    {link.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}
                    >
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(link)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
