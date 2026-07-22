import { useEffect, useState } from 'react'
import { listAdminAccounts, type AdminAccount } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { PageHeader, StatusDot } from '@/components/brand'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function tierBadge(tier: string) {
  if (tier === 'enterprise') return <Badge variant="ochre">Enterprise</Badge>
  if (tier === 'agency') return <Badge>Team</Badge>
  return <Badge variant="secondary">{tier.charAt(0).toUpperCase() + tier.slice(1)}</Badge>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PlatformAccounts() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listAdminAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load accounts'))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Platform"
        title="Accounts"
        description="Every account on the platform with usage rollups. The Stripe link opens the customer search for that email."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className="[&_td]:py-2 [&_th]:h-9">
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Workspaces</TableHead>
              <TableHead className="text-right">Links</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Scans</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead className="text-right">Stripe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{a.name || '—'}</span>
                    <span className="mono text-xs text-muted-foreground">{a.email ?? '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {tierBadge(a.tier)}
                    {a.is_platform_admin === 1 && <Badge variant="secondary">Admin</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <StatusDot tone={a.subscription_status === 'active' ? 'success' : 'neutral'}>
                      {a.subscription_status}
                    </StatusDot>
                    {!a.is_active && <StatusDot tone="warning">Disabled</StatusDot>}
                  </div>
                </TableCell>
                <TableCell className="mono text-right text-xs">
                  {a.client_count}/{a.max_clients >= 999 ? '∞' : a.max_clients}
                </TableCell>
                <TableCell className="mono text-right text-xs">{a.link_count}</TableCell>
                <TableCell className="mono text-right text-xs">{a.total_clicks}</TableCell>
                <TableCell className="mono text-right text-xs">{a.total_scans}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(a.last_activity)}</TableCell>
                <TableCell className="text-right">
                  {a.email ? (
                    <a
                      href={`https://dashboard.stripe.com/customers?email=${encodeURIComponent(a.email)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[0.625rem] tracking-[0.1em] text-ochre uppercase underline-offset-2 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}

            {!isLoading && accounts.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={10} className="font-serif text-sm text-muted-foreground italic">
                  No accounts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
