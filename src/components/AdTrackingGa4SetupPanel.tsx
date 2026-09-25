import { useEffect, useState } from 'react'
import {
  downloadAdTrackingGtmExport,
  getAdTrackingGa4Setup,
  getAdTrackingGtagSnippet,
  type AdTrackingGa4Setup,
  type Client,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

/**
 * Ad tracking measurement setup (AD_TRACKING_LINKS_GA4_PLAN.md §6).
 *
 * This phase stops at making wt_* parameters land correctly in GA4 as
 * reportable custom dimensions — it does NOT pull GA4 numbers back into the
 * dashboard for these links (§2.3, §9). So this panel is instructions and
 * generated setup files, not a report.
 *
 * Waytrace has read-only GA4 access and no Google Tag Manager API integration
 * at all (§2.1) — nothing here writes to a customer's live GA4 property or GTM
 * container. The GTM file is a variables-only import the customer applies
 * themselves; the custom-dimension steps are manual, in GA4's own UI.
 */
export function AdTrackingGa4SetupPanel({ clients }: { clients: Client[] }) {
  const { tier, isEnterprise } = useAuth()
  const entitled = tier === 'agency' || isEnterprise

  const [clientId, setClientId] = useState<number | null>(null)
  const [setup, setSetup] = useState<AdTrackingGa4Setup | null>(null)
  const [snippet, setSnippet] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!entitled) return
    if (clientId === null && clients.length > 0) setClientId(clients[0].id)
  }, [entitled, clients, clientId])

  useEffect(() => {
    if (!entitled || clientId === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setSnippet(null)

    getAdTrackingGa4Setup(clientId)
      .then((data) => {
        if (cancelled) return
        setSetup(data)
        if (data.link_count > 0) {
          return getAdTrackingGtagSnippet(clientId).then((s) => {
            if (!cancelled) setSnippet(s.snippet)
          })
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load GA4 setup')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [entitled, clientId])

  async function handleDownload() {
    if (clientId === null) return
    setDownloading(true)
    try {
      await downloadAdTrackingGtmExport(clientId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download GTM variables')
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopySnippet() {
    if (!snippet) return
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!entitled || clients.length === 0) return null

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Ad tracking measurement setup</CardTitle>
        <CardDescription>
          Ad tracking links carry parameters like <span className="font-mono text-xs">wt_placement</span> and{' '}
          <span className="font-mono text-xs">wt_link_id</span> that GA4 does not record automatically. This sets
          up the custom dimensions and page-side capture so that data lands in GA4 and can be attributed back to a
          specific Waytrace link.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {clients.length > 1 && (
          <Select value={clientId ? String(clientId) : ''} onValueChange={(v) => setClientId(Number(v))}>
            <SelectTrigger className="sm:w-72">
              {/* Base UI's SelectValue falls back to the raw value string by
                  default, so without this it would show the workspace id
                  instead of its name — same fix already applied elsewhere
                  (AdTrackingLinkForm's workspace picker, Integrations' GA4
                  property picker). */}
              <span className="flex flex-1 text-left">
                {clients.find((c) => c.id === clientId)?.name ?? 'Select a workspace'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && <p className="font-serif text-sm text-muted-foreground italic">Loading...</p>}

        {!loading && setup && setup.link_count === 0 && (
          <p className="text-sm text-muted-foreground">
            No ad tracking links in this workspace yet. Create one to see setup instructions here.
          </p>
        )}

        {!loading && setup && setup.link_count > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm">
              {setup.ga4_connected ? (
                <>
                  <Badge variant="success">Connected</Badge>
                  <span>{setup.ga4_property_name}</span>
                </>
              ) : (
                <>
                  <Badge variant="secondary">Not connected</Badge>
                  <span className="text-muted-foreground">
                    Connect this workspace to a GA4 property above before registering custom dimensions.
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="eyebrow-sm">1. Register these as GA4 custom dimensions</h4>
              <p className="text-xs text-muted-foreground">
                In GA4:{' '}
                <span className="font-mono">Admin → Custom definitions → Create custom dimension</span>. Scope:{' '}
                <span className="font-mono">Event</span>. Use the exact event parameter name shown.
              </p>
              <dl className="divide-y divide-border rounded-md border border-border">
                {setup.keys.map((k) => (
                  <div key={k.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                    <dt className="w-40 shrink-0 text-sm">{k.suggested_label}</dt>
                    <dd className="flex min-w-0 flex-1 items-center gap-2">
                      <code className="font-mono text-xs">{k.key}</code>
                      {k.always_present && (
                        <Badge variant="outline" className="shrink-0 text-[0.625rem]">
                          Every link
                        </Badge>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="eyebrow-sm">2. If your landing pages use Google Tag Manager</h4>
              <p className="text-xs text-muted-foreground">
                Download variables for the parameters above, import them into your GTM container (Admin → Import
                Container → choose "Merge"), then attach them as event parameters on your existing GA4
                configuration or event tag. This file adds variables only — no tags or triggers, since Waytrace
                doesn't know your container's existing setup.
              </p>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Preparing...' : 'Download GTM variables'}
              </Button>
            </div>

            {snippet && (
              <div className="flex flex-col gap-2">
                <h4 className="eyebrow-sm">3. If your landing pages call gtag.js directly</h4>
                <p className="text-xs text-muted-foreground">
                  Paste this after your existing <span className="font-mono">gtag('config', ...)</span> call.
                </p>
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <code className="block overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre">
                    {snippet}
                  </code>
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={handleCopySnippet}>
                    {copied ? 'Copied' : 'Copy snippet'}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This only applies to ad tracking links created or edited from now on. Links already pasted into a
              live ad won't pick up <span className="font-mono">wt_link_id</span> unless you re-save and re-paste
              them.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
