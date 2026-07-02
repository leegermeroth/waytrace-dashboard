import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { deleteLink, getLinkHistory, getLinkStats, listLinks, type DestinationHistoryEntry, type Link, type LinkStats } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function LinkDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [link, setLink] = useState<Link | null>(null)
  const [stats, setStats] = useState<LinkStats | null>(null)
  const [history, setHistory] = useState<DestinationHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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
  }, [id])

  function shortUrl(l: Link) {
    const domain = l.short_domain || 'waygo.to'
    return `https://${domain}/${l.short_code}`
  }

  async function handleCopy() {
    if (!link) return
    await navigator.clipboard.writeText(shortUrl(link))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
    return <p className="text-sm text-muted-foreground">Loading...</p>
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{link.label || link.short_code}</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}>
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">Short URL:</span>
            <button onClick={handleCopy} className="text-primary hover:underline">
              {copied ? 'Copied!' : shortUrl(link)}
            </button>
          </div>
          <p>
            <span className="font-medium">Destination:</span>{' '}
            <a href={link.destination_url} target="_blank" rel="noreferrer" className="hover:underline">
              {link.destination_url}
            </a>
          </p>
          <p>
            <span className="font-medium">Total clicks:</span> {link.clicks}
          </p>
          <p>
            <span className="font-medium">Created:</span>{' '}
            {new Date(link.created_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clicks over time</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {stats && stats.clicksByDay.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.clicksByDay}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--color-primary, #2563eb)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No click data yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>UTM parameters</CardTitle>
          </CardHeader>
          <CardContent>
            {utmParams.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {utmParams.map(([key, value]) => (
                  <li key={key} className="flex justify-between border-b pb-1 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No UTM parameters set.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clicks by country</CardTitle>
          </CardHeader>
          <CardContent>
            {stats && stats.byCountry.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {stats.byCountry.map((row) => (
                  <li
                    key={row.country}
                    className="flex justify-between border-b pb-1 last:border-0 last:pb-0"
                  >
                    <span className="text-muted-foreground">{row.country}</span>
                    <span className="font-medium">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No click data yet.</p>
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
    </div>
  )
}
