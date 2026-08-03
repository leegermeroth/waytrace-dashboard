import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMe,
  getGa4Connections,
  getGa4Properties,
  getGa4AuthUrl,
  disconnectGa4,
  setWorkspaceGa4Property,
  getPluginInfo,
  listWordPressSiteCredentials,
  revokeWordPressSiteCredential,
  listClients,
  type Me,
  type Ga4Connection,
  type Ga4Property,
  type PluginInfo,
  type Client,
  type WordPressSiteCredential,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/brand'

const NONE = 'none'
const mappingValue = (connectionId?: number | null, propertyId?: string | null) =>
  connectionId && propertyId ? `${connectionId}::${propertyId}` : NONE

// Human-readable copy for the ?ga4=error&reason= codes the callback redirects with.
const ERROR_REASONS: Record<string, string> = {
  denied: 'You cancelled the Google sign-in. No account was connected.',
  bad_state: 'The sign-in link expired. Please try connecting again.',
  missing_code: 'Google did not return an authorization code. Please try again.',
  no_refresh_token:
    'Google did not return a refresh token. Remove Waytrace from your Google account permissions, then reconnect.',
  exchange_failed: 'Could not complete the connection with Google. Please try again.',
  not_configured: 'The GA4 integration is not configured on the server.',
}

export default function Integrations() {
  const [me, setMe] = useState<Me | null>(null)
  const [connections, setConnections] = useState<Ga4Connection[]>([])
  const [properties, setProperties] = useState<Ga4Property[]>([])
  const [propertyErrors, setPropertyErrors] = useState<{ google_email: string; error: string }[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  const [siteCredentials, setSiteCredentials] = useState<WordPressSiteCredential[]>([])
  const [revokingCredentialId, setRevokingCredentialId] = useState<number | null>(null)
  const [downloadingPlugin, setDownloadingPlugin] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [connecting, setConnecting] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()

  // Surface the callback result (?ga4=connected|error) then clean the URL.
  useEffect(() => {
    const ga4 = searchParams.get('ga4')
    if (ga4 === 'connected') {
      const email = searchParams.get('email')
      setBanner({ kind: 'success', message: `Connected${email ? ` ${email}` : ''}. Map your workspaces to a property below.` })
    } else if (ga4 === 'error') {
      const reason = searchParams.get('reason') ?? ''
      setBanner({ kind: 'error', message: ERROR_REASONS[reason] ?? 'Could not connect Google Analytics. Please try again.' })
    }
    if (ga4) {
      searchParams.delete('ga4')
      searchParams.delete('reason')
      searchParams.delete('email')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const meData = await getMe()
      setMe(meData)
      if (meData.tier === 'free') {
        setLoading(false)
        return
      }
      const isOwner = meData.user_id == null
      const [conns, props, cls, pluginInfo, sites] = await Promise.all([
        getGa4Connections(),
        getGa4Properties(),
        listClients(),
        // Plugin download and site-credential management are owner-only.
        isOwner ? getPluginInfo().catch(() => null) : Promise.resolve(null),
        isOwner ? listWordPressSiteCredentials().catch(() => []) : Promise.resolve([]),
      ])
      setConnections(conns)
      setProperties(props.properties)
      setPropertyErrors(props.errors)
      setClients(cls)
      setPlugin(pluginInfo)
      setSiteCredentials(sites)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleConnect() {
    setConnecting(true)
    try {
      const { url } = await getGa4AuthUrl()
      window.location.href = url
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Could not start Google sign-in' })
      setConnecting(false)
    }
  }

  async function handleDisconnect(conn: Ga4Connection) {
    if (!confirm(`Disconnect ${conn.google_email}? Any workspace mapped to one of its properties will lose GA4 data.`)) return
    setDisconnectingId(conn.id)
    try {
      await disconnectGa4(conn.id)
      await loadAll()
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to disconnect' })
    } finally {
      setDisconnectingId(null)
    }
  }

  async function handleRevokeSite(credential: WordPressSiteCredential) {
    if (!confirm(`Disconnect ${credential.label || credential.site_url || 'this WordPress site'}? That site will need to reconnect before it can use Waytrace again.`)) return
    setRevokingCredentialId(credential.id)
    try {
      await revokeWordPressSiteCredential(credential.id)
      setSiteCredentials((rows) => rows.map((row) =>
        row.id === credential.id ? { ...row, revoked_at: new Date().toISOString(), revoke_reason: 'owner_revoked' } : row
      ))
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to disconnect WordPress site' })
    } finally {
      setRevokingCredentialId(null)
    }
  }

  async function handlePluginDownload() {
    setDownloadingPlugin(true)
    try {
      // Download grants expire after five minutes, so obtain one at click time.
      const latest = await getPluginInfo()
      if (!latest) throw new Error('No licensed Waytrace Pro release is available for this account')
      setPlugin(latest)
      window.location.assign(latest.download_url)
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to authorize plugin download' })
    } finally {
      setDownloadingPlugin(false)
    }
  }

  async function handleMap(clientId: number, value: string) {
    const prev = clients
    const mapping =
      value === NONE
        ? null
        : (() => {
            const [connIdRaw, propId] = value.split('::')
            const p = properties.find((x) => x.connection_id === Number(connIdRaw) && x.property_id === propId)
            return p ? { connection_id: p.connection_id, property_id: p.property_id, property_name: p.property_name } : null
          })()

    // Optimistic update.
    setClients((cs) =>
      cs.map((c) =>
        c.id === clientId
          ? {
              ...c,
              ga4_connection_id: mapping?.connection_id ?? null,
              ga4_property_id: mapping?.property_id ?? null,
              ga4_property_name: mapping?.property_name ?? null,
            }
          : c
      )
    )
    try {
      await setWorkspaceGa4Property(clientId, mapping)
    } catch (err) {
      setClients(prev) // revert
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to save mapping' })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Account" title="Integrations" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  // Free tier — upsell.
  if (me?.tier === 'free') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Account" title="Integrations" />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Google Analytics</CardTitle>
            <CardDescription>
              Connect GA4 to see what happens after the click — sessions, key events, and revenue for every
              campaign. Available on paid plans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/dashboard/billing" className={buttonVariants()}>Upgrade to connect</a>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title="Integrations"
        description="Bring Waytrace into WordPress, and connect Google Analytics for post-click performance."
      />

      {banner && (
        <Alert variant={banner.kind === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      )}
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* WordPress plugin */}
      {plugin && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>WordPress plugin</CardTitle>
            <CardDescription>Build and manage your tracking links without leaving WordPress.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Install the Waytrace plugin and sign in with this same account — your workspaces, links, and
              campaign data all appear right inside your WordPress admin. Nothing to re-enter, and it stays in sync.
            </p>
            <Button className="w-fit" disabled={downloadingPlugin} onClick={handlePluginDownload}>
              {downloadingPlugin ? 'Authorizing download...' : `Download plugin · v${plugin.version}`}
            </Button>
            <p className="mono text-[0.7rem] leading-relaxed text-slate">
              In WordPress: Plugins → Add New → Upload Plugin → choose the .zip → Activate → connect with your Waytrace email and password.
            </p>
          </CardContent>
        </Card>
      )}

      {me && me.user_id == null && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Connected WordPress sites</CardTitle>
            <CardDescription>
              Each site has its own credential. Disconnecting one site does not sign out the dashboard or affect other sites.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {siteCredentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No site-specific connections yet. Install or update Waytrace Pro to 2.4.5, then connect from WordPress.
              </p>
            ) : (
              siteCredentials.map((credential) => (
                <div key={credential.id} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {credential.label || credential.site_url || `WordPress site ${credential.id}`}
                    </span>
                    {credential.site_url && <span className="mono truncate text-xs text-slate">{credential.site_url}</span>}
                    <span className="text-xs text-muted-foreground">
                      {credential.last_used_at
                        ? `Last used ${new Date(credential.last_used_at).toLocaleString()}`
                        : `Connected ${new Date(credential.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={credential.revoked_at ? 'secondary' : 'success'}>
                      {credential.revoked_at ? 'Disconnected' : 'Active'}
                    </Badge>
                    {!credential.revoked_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revokingCredentialId === credential.id}
                        onClick={() => handleRevokeSite(credential)}
                      >
                        {revokingCredentialId === credential.id ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Connected Google logins */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Google Analytics</CardTitle>
          <CardDescription>
            Connect one or more Google accounts. Each workspace maps to a GA4 property from any connected account.
            GA4 must be installed on the workspace's destination site for data to appear.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Google accounts connected yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="mono text-sm font-medium">{conn.google_email}</span>
                    <span className="eyebrow-sm">Connected {new Date(conn.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {conn.status === 'error' ? (
                      <Badge variant="destructive">Reconnect needed</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDisconnect(conn)}
                      disabled={disconnectingId === conn.id}
                    >
                      {disconnectingId === conn.id ? 'Removing…' : 'Disconnect'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button onClick={handleConnect} disabled={connecting} className="w-fit">
            {connecting ? 'Redirecting…' : connections.length === 0 ? 'Connect Google Analytics' : 'Add another Google account'}
          </Button>

          {propertyErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                Couldn't load properties for {propertyErrors.map((e) => e.google_email).join(', ')}. Try reconnecting that account.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Workspace → property mapping */}
      {connections.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Workspace properties</CardTitle>
            <CardDescription>
              Choose which GA4 property each workspace's links report against.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workspaces yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-medium">{c.name}</span>
                    <Select
                      value={mappingValue(c.ga4_connection_id, c.ga4_property_id)}
                      onValueChange={(v) => handleMap(c.id, v ?? NONE)}
                    >
                      <SelectTrigger className="h-8 w-auto min-w-56">
                        <SelectValue placeholder="No GA4 property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No GA4 property</SelectItem>
                        {properties.map((p) => (
                          <SelectItem key={`${p.connection_id}::${p.property_id}`} value={`${p.connection_id}::${p.property_id}`}>
                            {p.property_name} · {p.google_email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
