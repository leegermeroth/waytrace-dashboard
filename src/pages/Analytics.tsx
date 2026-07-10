import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getAnalytics,
  listClients,
  listLinks,
  type Analytics as AnalyticsData,
  type AnalyticsDimensionRow,
  type Client,
  type Link,
} from '@/lib/api'
import { PageHeader, StatCard } from '@/components/brand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
] as const

/** Compute the `from` YYYY-MM-DD bound for a range preset ('all' → undefined). */
function rangeFrom(range: string): string | undefined {
  if (range === 'all') return undefined
  const days = Number(range)
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Legend swatch. */
function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
      <span className="mono text-[0.625rem] tracking-[0.08em] text-slate uppercase">{label}</span>
    </span>
  )
}

/** A proportional clicks/scans breakdown for one dimension (source, medium, …). */
function BreakdownCard({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: AnalyticsDimensionRow[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="font-serif text-sm text-muted-foreground italic">No data in this range.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.slice(0, 8).map((r) => (
              <li key={r.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="mono truncate text-xs text-foreground">{r.key}</span>
                  <span className="mono shrink-0 text-xs text-muted-foreground">
                    {r.total.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border/60">
                  <div
                    className="flex h-full overflow-hidden rounded-full"
                    style={{ width: `${(r.total / max) * 100}%` }}
                  >
                    <div style={{ width: `${(r.clicks / r.total) * 100}%`, background: 'var(--chart-1)' }} />
                    <div style={{ width: `${(r.scans / r.total) * 100}%`, background: 'var(--chart-2)' }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default function Analytics() {
  const [clients, setClients] = useState<Client[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Filters.
  const [workspace, setWorkspace] = useState('all')
  const [source, setSource] = useState('all')
  const [medium, setMedium] = useState('all')
  const [campaign, setCampaign] = useState('all')
  const [range, setRange] = useState('30')

  // Load workspaces + links once for the filter option lists.
  useEffect(() => {
    Promise.all([listClients(), listLinks()])
      .then(([c, l]) => {
        setClients(c)
        setLinks(l)
      })
      .catch(() => {
        /* Non-fatal — analytics can still load without filter option lists. */
      })
  }, [])

  // Distinct filter values across the current links.
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

  // Fetch aggregates whenever the filters change.
  useEffect(() => {
    setIsLoading(true)
    setError(null)
    getAnalytics({
      client_id: workspace !== 'all' ? Number(workspace) : undefined,
      source: source !== 'all' ? source : undefined,
      medium: medium !== 'all' ? medium : undefined,
      campaign: campaign !== 'all' ? campaign : undefined,
      from: rangeFrom(range),
    })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [workspace, source, medium, campaign, range])

  const totals = data?.totals ?? { total: 0, clicks: 0, scans: 0 }
  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Clicks and QR scans across your links — filtered by workspace, campaign, source, medium, and time."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={workspace} onValueChange={(v) => setWorkspace(v ?? 'all')}>
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

        {distinct.source.length > 0 && (
          <Select value={source} onValueChange={(v) => setSource(v ?? 'all')}>
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
          <Select value={medium} onValueChange={(v) => setMedium(v ?? 'all')}>
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
          <Select value={campaign} onValueChange={(v) => setCampaign(v ?? 'all')}>
            <SelectTrigger className="h-8 w-auto min-w-36">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {distinct.campaign.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={range} onValueChange={(v) => setRange(v ?? '30')}>
          <SelectTrigger className="h-8 w-auto min-w-36">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total interactions" value={isLoading ? '—' : totals.total.toLocaleString()} reference />
        <StatCard label="Link clicks" value={isLoading ? '—' : totals.clicks.toLocaleString()} />
        <StatCard label="QR scans" value={isLoading ? '—' : totals.scans.toLocaleString()} />
      </div>

      {/* Activity over time */}
      <Card>
        <CardHeader>
          <CardTitle>Activity over time</CardTitle>
          <CardDescription>Link clicks and QR scans by day · {rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.timeseries.length > 0 ? (
            <>
              <div className="mb-3 flex items-center gap-4">
                <Swatch color="var(--chart-1)" label="Clicks" />
                <Swatch color="var(--chart-2)" label="Scans" />
              </div>
              <div className="dot-grid-well h-72 rounded-md border border-border p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.timeseries} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d: string) => d.slice(5)}
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
                      cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                    />
                    <Legend wrapperStyle={{ display: 'none' }} />
                    <Bar dataKey="clicks" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="scans" stackId="a" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="font-serif text-sm text-muted-foreground italic">
              {isLoading ? 'Loading…' : 'No activity in this range yet.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard title="By source" description="Where traffic originates" rows={data?.bySource ?? []} />
        <BreakdownCard title="By medium" description="Channel type" rows={data?.byMedium ?? []} />
        <BreakdownCard title="By campaign" description="Grouped by utm_campaign" rows={data?.byCampaign ?? []} />
        <BreakdownCard title="By workspace" description="Grouped by workspace" rows={data?.byWorkspace ?? []} />
      </div>

      {/* Top links */}
      <Card>
        <CardHeader>
          <CardTitle>Top links</CardTitle>
          <CardDescription>Most activity in this range</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.topLinks.length > 0 ? (
            <ul className="flex flex-col">
              {data.topLinks.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0"
                >
                  <RouterLink to={`/dashboard/links/${l.id}`} className="truncate font-medium hover:text-ochre">
                    {l.label}
                  </RouterLink>
                  <span className="mono shrink-0 text-xs text-muted-foreground">
                    {l.clicks.toLocaleString()} clicks · {l.scans.toLocaleString()} scans
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-serif text-sm text-muted-foreground italic">
              {isLoading ? 'Loading…' : 'No link activity in this range yet.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
