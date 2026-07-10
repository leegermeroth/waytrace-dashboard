import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import {
  CartesianGrid,
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
import { PageHeader } from '@/components/brand'

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
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="eyebrow-sm">Total clicks</span>
              <span className="mono text-foreground">{link.clicks}</span>
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
          <CardTitle>Clicks over time</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
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
    </div>
  )
}
