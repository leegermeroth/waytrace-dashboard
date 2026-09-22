import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  getAdTrackingConfig,
  type AdPlatformDto,
  type AdTrackingConfig,
  type DestinationHistoryEntry,
  type Link,
} from '@/lib/api'
import { loadAdPlatforms } from '@/lib/adPlatforms'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/brand'
import { AdLinkPreview } from '@/components/AdLinkPreview'

/**
 * Detail view for an Ad Tracking Link (AD_TRACKING_LINKS_PLAN.md §9.4).
 *
 * Deliberately NOT the standard link detail page. These links have no short
 * link, no QR code, and no Waytrace click data, so every panel that page is
 * built around would be either empty or actively misleading here. What matters
 * instead is the parameter configuration and the strings to paste into the ad
 * platform.
 *
 * The copyable strings are the ones the Worker STORED at save time — the exact
 * bytes intended for the ad platform. Nothing is regenerated client-side.
 */
export function AdTrackingLinkDetail({
  link,
  history,
  onDelete,
}: {
  link: Link
  history: DestinationHistoryEntry[]
  onDelete: () => void
}) {
  const [config, setConfig] = useState<AdTrackingConfig | null>(null)
  const [platform, setPlatform] = useState<AdPlatformDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([getAdTrackingConfig(link.id), loadAdPlatforms()])
      .then(([cfg, registry]) => {
        if (cancelled) return
        setConfig(cfg)
        setPlatform(registry.find((p) => p.id === cfg.platform) ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load configuration')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [link.id])

  const platformLabel =
    platform?.label ?? (link.ad_platform === 'google' ? 'Google Ads' : 'Meta Ads')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Ad tracking link"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {link.label || 'Ad tracking link'}
            <Badge variant="outline">{platformLabel}</Badge>
          </span>
        }
        description={link.destination_url}
        actions={
          <>
            <Button
              variant="outline"
              render={<RouterLink to={`/dashboard/links/${link.id}/edit`} />}
            >
              Edit
            </Button>
            <Button variant="destructive-ghost" onClick={onDelete}>
              Delete
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/*
        §32 — never show "0 clicks" for these. Waytrace did not observe zero
        traffic; it did not observe the traffic at all, which is a different
        claim. Say so plainly instead.
      */}
      <Alert>
        <AlertDescription>
          <span className="font-medium">Analytics: External.</span> This link sends visitors
          directly to the destination, so Waytrace does not record clicks. Traffic appears in
          whichever analytics platform receives these parameters.
        </AlertDescription>
      </Alert>

      {config?.notices?.length ? (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Worth reviewing:</span>
            <ul className="mt-1 list-disc pl-5">
              {config.notices.map((n) => (
                <li key={`${n.field}-${n.code}`}>{n.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading && (
        <p className="font-serif text-sm text-muted-foreground italic">Loading configuration…</p>
      )}

      {config && platform && (
        <Card>
          <CardHeader>
            <CardTitle>Tracking configuration</CardTitle>
            <CardDescription>
              Paste these into {platformLabel}. Values shown in{' '}
              <span className="font-mono text-xs">{'{...}'}</span> are filled in by the platform
              when someone clicks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdLinkPreview
              platform={platform}
              preview={{
                valid: true,
                errors: [],
                warnings: [],
                params: config.params,
                suffix: config.suffix,
                final_url: config.final_url,
                full_url: config.full_url,
                destination: config.destination_url,
              }}
            />
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Destination changes</CardTitle>
            <CardDescription>
              Waytrace cannot change an ad that is already running, so this is the record of when
              the landing page moved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleString()}
                  </span>
                  <span className="break-all text-muted-foreground line-through">
                    {entry.old_destination}
                  </span>
                  <span className="break-all">{entry.new_destination}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
