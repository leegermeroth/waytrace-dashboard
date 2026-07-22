import { useEffect, useState } from 'react'
import { getPlatformStats, type PlatformStats as Stats } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/brand'

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  agency: 'Team',
  enterprise: 'Enterprise',
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="eyebrow-sm">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export default function PlatformStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Platform"
        title="Stats"
        description="Platform-wide totals across every account."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Accounts" value={stats.totals.accounts} />
            <StatTile label="Active subs" value={stats.totals.active_subscriptions} />
            <StatTile label="Workspaces" value={stats.totals.workspaces} />
            <StatTile label="Links" value={stats.totals.links} />
            <StatTile label="Clicks" value={stats.totals.clicks} />
            <StatTile label="Scans" value={stats.totals.scans} />
            <StatTile label="Branded domains" value={stats.totals.domains} />
            <StatTile label="Total hits" value={stats.totals.clicks + stats.totals.scans} />
          </div>

          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Accounts by tier</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {stats.accounts_by_tier.map((row) => (
                  <li key={row.tier} className="flex items-center justify-between">
                    <span className="text-sm">{TIER_LABELS[row.tier] ?? row.tier}</span>
                    <span className="mono text-sm font-semibold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
