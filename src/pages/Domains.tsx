import { useEffect, useState, type FormEvent } from 'react'
import { listDomains, createDomain, refreshDomainStatus, deleteDomain, type CustomDomain } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function Domains() {
  const [domains, setDomains] = useState<CustomDomain[]>([])
  const [cnameTarget, setCnameTarget] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [hostname, setHostname] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<{ domain: CustomDomain; cnameTarget: string } | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    listDomains()
      .then(({ domains, cnameTarget }) => {
        setDomains(domains)
        setCnameTarget(cnameTarget)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load domains'))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddSuccess(null)
    setIsAdding(true)
    try {
      const result = await createDomain(hostname.trim().toLowerCase())
      setDomains((prev) => [result.domain, ...prev])
      setCnameTarget(result.cnameTarget)
      setAddSuccess(result)
      setHostname('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleRefresh(id: number) {
    setRefreshingId(id)
    try {
      const updated = await refreshDomainStatus(id)
      setDomains((prev) => prev.map((d) => (d.id === id ? updated : d)))
    } catch {
      // Status check failed — leave as-is.
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleDelete(id: number, hostname: string) {
    if (!confirm(`Remove ${hostname}? Short links on this domain will stop working.`)) return
    setDeletingId(id)
    try {
      await deleteDomain(id)
      setDomains((prev) => prev.filter((d) => d.id !== id))
      if (addSuccess?.domain.id === id) setAddSuccess(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove domain')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Custom Domains</h1>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Add a domain</CardTitle>
          <CardDescription>
            Use your own domain for short links (e.g. <code>go.yourdomain.com</code>).
            After adding, point a CNAME at <code>{cnameTarget || 'links.waygo.to'}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            {addError && (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}

            {addSuccess && (
              <Alert>
                <AlertDescription>
                  <p className="font-medium mb-2">Domain added. Add this DNS record at your registrar:</p>
                  <div className="rounded bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                    <div><span className="text-muted-foreground">Type:</span> CNAME</div>
                    <div><span className="text-muted-foreground">Name:</span> {addSuccess.domain.hostname.split('.')[0]}</div>
                    <div><span className="text-muted-foreground">Value:</span> {addSuccess.cnameTarget}</div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Status will update to Active once the CNAME propagates (usually a few minutes).
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="hostname">Hostname</Label>
              <Input
                id="hostname"
                placeholder="go.yourdomain.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isAdding} className="w-fit">
              {isAdding ? 'Adding…' : 'Add domain'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {domains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your domains</CardTitle>
            {cnameTarget && (
              <CardDescription>
                All domains should have a CNAME pointing to <code>{cnameTarget}</code>.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{domain.hostname}</span>
                    <span className="text-xs text-muted-foreground">
                      Added {new Date(domain.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={domain.status} />
                    {domain.status !== 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRefresh(domain.id)}
                        disabled={refreshingId === domain.id}
                      >
                        {refreshingId === domain.id ? 'Checking…' : 'Check status'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(domain.id, domain.hostname)}
                      disabled={deletingId === domain.id}
                    >
                      {deletingId === domain.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: CustomDomain['status'] }) {
  if (status === 'active') return <Badge variant="default">Active</Badge>
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>
  return <Badge variant="secondary">Pending CNAME</Badge>
}
