import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { listLinks, type Link } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader, StatCard } from '@/components/brand'

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Professional',
  agency: 'Team',
}

export default function Dashboard() {
  const { tier, subscriptionStatus } = useAuth()
  const [links, setLinks] = useState<Link[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listLinks()
      .then(setLinks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load links'))
      .finally(() => setIsLoading(false))
  }, [])

  const totalLinks = links.length
  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0)
  const topLinks = [...links].sort((a, b) => b.clicks - a.clicks).slice(0, 5)
  const planLabel = tier ? TIER_LABELS[tier] ?? tier : '—'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Overview"
        title="Home"
        description="Your foundation at a glance — links, clicks, and plan."
        actions={
          <Button render={<RouterLink to="/dashboard/links/new" />}>New link</Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total links" value={isLoading ? '—' : totalLinks} reference />
        <StatCard label="Total clicks" value={isLoading ? '—' : totalClicks} />
        <StatCard
          label="Plan"
          value={planLabel}
          hint={<span className="capitalize">{subscriptionStatus}</span>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top links</CardTitle>
          <CardDescription>Your best performing links by clicks.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoading && topLinks.length === 0 ? (
            <p className="font-serif text-[15px] text-muted-foreground italic">
              No links yet.{' '}
              <RouterLink
                to="/dashboard/links/new"
                className="font-sans text-ochre not-italic hover:text-ochre-hover hover:underline"
              >
                Create your first link
              </RouterLink>{' '}
              to start building your foundation.
            </p>
          ) : (
            <ul className="flex flex-col">
              {topLinks.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
                >
                  <RouterLink
                    to={`/dashboard/links/${link.id}`}
                    className="font-medium hover:text-ochre"
                  >
                    {link.label || link.short_code}
                  </RouterLink>
                  <span className="mono text-muted-foreground">{link.clicks} clicks</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
