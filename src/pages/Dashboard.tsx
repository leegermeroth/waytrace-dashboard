import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { listLinks, type Link } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button render={<RouterLink to="/dashboard/links/new" />}>New link</Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total links</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? '—' : totalLinks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total clicks</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? '—' : totalClicks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Plan</CardDescription>
            <CardTitle className="text-3xl capitalize">{tier ?? '—'}</CardTitle>
            <CardDescription className="capitalize">{subscriptionStatus}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top links</CardTitle>
          <CardDescription>Your best performing links by clicks.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoading && topLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No links yet.{' '}
              <RouterLink to="/dashboard/links/new" className="underline">
                Create your first link
              </RouterLink>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topLinks.map((link) => (
                <li key={link.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0 last:pb-0">
                  <RouterLink to={`/dashboard/links/${link.id}`} className="hover:underline">
                    {link.label || link.short_code}
                  </RouterLink>
                  <span className="font-medium">{link.clicks} clicks</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
