import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createAdTrackingLink,
  getAdTrackingConfig,
  listClients,
  previewAdTrackingLink,
  updateAdTrackingLink,
  type AdParam,
  type AdPlatformDto,
  type AdPlatformId,
  type AdPreviewResult,
  type AttributionParamDto,
  type Client,
} from '@/lib/api'
import { loadAdPlatforms, presetFor, primaryCampaignTypes } from '@/lib/adPlatforms'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { PageHeader } from '@/components/brand'
import { AdParamEditor } from '@/components/AdParamEditor'
import { AdLinkPreview } from '@/components/AdLinkPreview'

/**
 * Ad Tracking Links — create and edit (AD_TRACKING_LINKS_PLAN.md §9).
 *
 * These links do NOT route through Waytrace: the ad platform sends the visitor
 * straight to the landing page. So there is no short link, no QR code, and no
 * Waytrace click data — see the notices below, which say so plainly rather than
 * letting the UI imply otherwise.
 *
 * The preview and every copyable string come from the Worker's /preview
 * endpoint, which runs the same serializer and validator the save runs. Nothing
 * here assembles a URL.
 */
export default function AdTrackingLinkForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { tier, isEnterprise } = useAuth()
  const entitled = tier === 'agency' || isEnterprise

  const [platforms, setPlatforms] = useState<AdPlatformDto[]>([])
  const [attributionParam, setAttributionParam] = useState<AttributionParamDto | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [platformId, setPlatformId] = useState<AdPlatformId | ''>('')
  const [campaignType, setCampaignType] = useState<string | null>(null)
  const [destination, setDestination] = useState('')
  const [label, setLabel] = useState('')
  const [params, setParams] = useState<AdParam[]>([])
  const [acknowledged, setAcknowledged] = useState(false)

  const [preview, setPreview] = useState<AdPreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notices, setNotices] = useState<string[]>([])

  const platform = useMemo(
    () => platforms.find((p) => p.id === platformId) ?? null,
    [platforms, platformId]
  )

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!entitled) {
      setIsLoading(false)
      return
    }
    let cancelled = false

    async function load() {
      try {
        const [registry, clientList] = await Promise.all([loadAdPlatforms(), listClients()])
        if (cancelled) return
        setPlatforms(registry.platforms)
        setAttributionParam(registry.attribution_param)
        setClients(clientList)
        if (clientList.length === 1) setClientId(String(clientList[0].id))

        if (isEdit && id) {
          const config = await getAdTrackingConfig(Number(id))
          if (cancelled) return
          setClientId(String(config.client_id))
          setPlatformId(config.platform)
          setCampaignType(config.campaign_type)
          setDestination(config.destination_url)
          setLabel(config.label ?? '')
          setParams(config.params)
          // Tolerant on read: a saved config whose macros the platform no
          // longer supports stays editable and is never auto-rewritten.
          setNotices(config.notices.map((n) => n.message))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [entitled, id, isEdit])

  // ── live preview (debounced) ────────────────────────────────────────────────
  const previewSeq = useRef(0)

  const runPreview = useCallback(async () => {
    if (!platformId || !destination.trim() || params.length === 0) {
      setPreview(null)
      return
    }
    const seq = ++previewSeq.current
    setPreviewing(true)
    try {
      const result = await previewAdTrackingLink({
        platform: platformId,
        campaign_type: campaignType,
        destination_url: destination.trim(),
        params,
      })
      // Ignore a slow response that a newer keystroke has superseded.
      if (seq === previewSeq.current) setPreview(result)
    } catch (err) {
      if (seq === previewSeq.current) {
        setPreview(null)
        setError(err instanceof Error ? err.message : 'Preview failed')
      }
    } finally {
      if (seq === previewSeq.current) setPreviewing(false)
    }
  }, [platformId, campaignType, destination, params])

  useEffect(() => {
    const t = setTimeout(runPreview, 400)
    return () => clearTimeout(t)
  }, [runPreview])

  // Any change invalidates a previous duplicate acknowledgement.
  useEffect(() => {
    setAcknowledged(false)
  }, [destination, params, platformId, campaignType])

  // ── platform / campaign-type changes ───────────────────────────────────────
  function choosePlatform(next: AdPlatformId) {
    if (next === platformId) return
    const chosen = platforms.find((p) => p.id === next)
    setPlatformId(next)
    // Macros are platform-specific, so the previous set cannot carry over.
    const firstType = chosen?.campaign_types ? (primaryCampaignTypes(chosen)[0]?.id ?? null) : null
    setCampaignType(firstType)
    setParams(chosen ? presetFor(chosen, firstType) : [])
  }

  function chooseCampaignType(next: string) {
    setCampaignType(next)
    if (platform) setParams(presetFor(platform, next))
  }

  function resetToRecommended() {
    if (platform) setParams(presetFor(platform, campaignType))
  }

  // ── save ────────────────────────────────────────────────────────────────────
  const warnings = preview?.warnings ?? []
  const needsAck = warnings.length > 0 && !acknowledged
  const canSave =
    Boolean(preview?.valid) && !needsAck && Boolean(clientId) && !previewing && !isSaving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!platformId || !canSave) return
    setError(null)
    setIsSaving(true)

    const payload = {
      platform: platformId,
      campaign_type: campaignType,
      destination_url: destination.trim(),
      params,
      acknowledge_duplicates: warnings.length > 0,
      label: label.trim() || undefined,
    }

    try {
      if (isEdit && id) {
        await updateAdTrackingLink(Number(id), payload)
        navigate(`/dashboard/links/${id}`)
      } else {
        const created = await createAdTrackingLink({ ...payload, client_id: Number(clientId) })
        navigate(`/dashboard/links/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setIsSaving(false)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  if (!entitled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Build"
          title="Ad tracking links"
          description="Build ad links that automatically preserve campaign, ad, placement, and other platform context."
        />
        <Alert>
          <AlertDescription>
            Ad tracking links are available on the Team and Enterprise plans.{' '}
            <a className="underline" href="/dashboard/billing">
              See plans
            </a>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Build"
        title={isEdit ? 'Edit ad tracking link' : 'New ad tracking link'}
        description="Build ad links that automatically preserve campaign, ad, placement, and other platform context."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/*
        §31 — Waytrace cannot reach into a published ad. Editing here changes
        the saved configuration only; the live ad keeps whatever was pasted
        into it until the marketer pastes the new value.
      */}
      {isEdit && (
        <Alert>
          <AlertDescription>
            Changes here do not update ads that already use this tracking link. Copy the updated
            parameters into the advertising platform if you want the live ad configuration to
            change.
          </AlertDescription>
        </Alert>
      )}

      {notices.length > 0 && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Worth reviewing:</span>
            <ul className="mt-1 list-disc pl-5">
              {notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Advertising platform</CardTitle>
            <CardDescription>
              The platform fills in campaign and ad details when someone clicks, so you only set
              this up once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={p.id === platformId ? 'default' : 'outline'}
                  onClick={() => choosePlatform(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {platform && (
              <p className="text-sm text-muted-foreground">{platform.instructions}</p>
            )}

            {platform?.campaign_types && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="campaign_type">Campaign type</Label>
                <Select
                  value={campaignType ?? ''}
                  onValueChange={(v) => chooseCampaignType(String(v))}
                >
                  {/* Base UI's SelectValue falls back to the raw value. */}
                  <SelectTrigger id="campaign_type" className="sm:w-72">
                    <span className="flex flex-1 text-left">
                      {platform.campaign_types.find((t) => t.id === campaignType)?.label ??
                        'Select a campaign type'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {platform.campaign_types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Google supports different values depending on the campaign type, so this decides
                  what you can capture.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {platform && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. Landing page</CardTitle>
                <CardDescription>
                  Where the ad sends people. Visitors go straight here — this link does not pass
                  through Waytrace.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!isEdit && clients.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="workspace">Workspace</Label>
                    <Select value={clientId} onValueChange={(v) => setClientId(String(v))}>
                      <SelectTrigger id="workspace" className="sm:w-72">
                        <span className="flex flex-1 text-left">
                          {clients.find((c) => String(c.id) === clientId)?.name ??
                            'Select a workspace'}
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
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="destination">Landing page URL</Label>
                  <Input
                    id="destination"
                    type="text"
                    inputMode="url"
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="https://example.com/product"
                  />
                  <p className="text-xs text-muted-foreground">
                    Existing query parameters and anchors are preserved exactly.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="label">Label</Label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Spring prospecting - Meta"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. What to capture</CardTitle>
                <CardDescription>
                  Recommended setup for {platform.label}. Turn things off, rename a parameter, or
                  add your own.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <AdParamEditor
                  platform={platform}
                  campaignType={campaignType}
                  params={params}
                  onChange={setParams}
                />
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={resetToRecommended}>
                    Reset to recommended
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. Review and copy</CardTitle>
                <CardDescription>
                  Values shown in <span className="font-mono text-xs">{'{...}'}</span> are filled in
                  by {platform.label} at click time.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {preview?.errors?.length ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <ul className="list-disc pl-5">
                        {preview.errors.map((e) => (
                          <li key={`${e.field}-${e.code}`}>{e.message}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {warnings.length > 0 && (
                  <Alert>
                    <AlertDescription>
                      <ul className="list-disc pl-5">
                        {warnings.map((w) => (
                          <li key={`${w.field}-${w.code}`}>{w.message}</li>
                        ))}
                      </ul>
                      <label className="mt-3 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                          className="accent-ochre size-4"
                        />
                        Use this configuration anyway
                      </label>
                    </AlertDescription>
                  </Alert>
                )}

                {previewing && !preview && (
                  <p className="font-serif text-sm text-muted-foreground italic">
                    Building preview...
                  </p>
                )}

                {preview?.valid && (
                  <AdLinkPreview
                    platform={platform}
                    preview={preview}
                    attributionParam={attributionParam ?? undefined}
                  />
                )}

                {!preview && !previewing && (
                  <p className="text-sm text-muted-foreground">
                    Add a landing page and at least one parameter to see the preview.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!canSave}>
                {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Create ad tracking link'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
