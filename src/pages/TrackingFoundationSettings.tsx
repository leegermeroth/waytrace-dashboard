import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  batchTaxonomyValues,
  deleteTaxonomyValue,
  getMe,
  getTaxonomyValues,
  listClients,
  setOrgType,
  type Client,
  type TaxonomyValue,
} from '@/lib/api'
import {
  deriveFoundation,
  emptyFoundation,
  foundationFromValues,
  modelVocabulary,
  type FoundationState,
  type OrgType,
} from '@/lib/trackingFoundation'
import { TrackingFoundation } from '@/components/TrackingFoundation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The Tracking Foundation management surface — the same editor the onboarding
 * wizard uses, available any time from Settings and from Workspace management.
 * It edits an existing workspace's tracking values (plus the account-level
 * organization type), reconciling the model's channel selections against what's
 * already saved.
 *
 * A save only ever removes values the channel model governs (see
 * `modelVocabulary`), so any custom or externally-added value the model can't
 * represent is preserved rather than silently dropped on round-trip.
 */
export default function TrackingFoundationSettings() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [clients, setClients] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [orgTypeSaved, setOrgTypeSaved] = useState<OrgType | null>(null)

  const [sourceValues, setSourceValues] = useState<TaxonomyValue[]>([])
  const [mediumValues, setMediumValues] = useState<TaxonomyValue[]>([])
  const [state, setState] = useState<FoundationState>(emptyFoundation)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Load workspaces + account org type once.
  useEffect(() => {
    Promise.all([listClients(), getMe()])
      .then(([cs, me]) => {
        setClients(cs)
        setOrgTypeSaved((me.org_type as OrgType | null) ?? null)
        const fromQuery = Number(searchParams.get('workspace'))
        const initial = cs.find((c) => c.id === fromQuery) ?? cs[0] ?? null
        setSelectedId(initial?.id ?? null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workspaces'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the selected workspace's saved values whenever the selection changes.
  useEffect(() => {
    if (selectedId == null) return
    setSaved(false)
    setError(null)
    Promise.all([
      getTaxonomyValues(selectedId, 'utm_source'),
      getTaxonomyValues(selectedId, 'utm_medium'),
    ])
      .then(([src, med]) => {
        setSourceValues(src)
        setMediumValues(med)
        setState(foundationFromValues(src, med, orgTypeSaved))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tracking values'))
  }, [selectedId, orgTypeSaved])

  const desired = useMemo(() => deriveFoundation(state), [state])

  async function handleSave() {
    if (selectedId == null) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const vocab = modelVocabulary()

      // Additions: desired values not already saved.
      const currentSources = new Set(sourceValues.map((v) => v.value))
      const currentMediums = new Set(mediumValues.map((v) => v.value))
      const addSources = desired.sources.filter((s) => !currentSources.has(s))
      const addMediums = desired.mediums.filter((m) => !currentMediums.has(m))

      // Removals: currently-saved values the model governs that are no longer desired.
      const desiredSourceSet = new Set(desired.sources)
      const desiredMediumSet = new Set(desired.mediums)
      const removeSourceIds = sourceValues
        .filter((v) => vocab.sources.has(v.value) && !desiredSourceSet.has(v.value))
        .map((v) => v.id)
      const removeMediumIds = mediumValues
        .filter((v) => vocab.mediums.has(v.value) && !desiredMediumSet.has(v.value))
        .map((v) => v.id)

      const tasks: Promise<unknown>[] = []
      if (addSources.length) tasks.push(batchTaxonomyValues(selectedId, 'utm_source', addSources))
      if (addMediums.length) tasks.push(batchTaxonomyValues(selectedId, 'utm_medium', addMediums))
      for (const id of [...removeSourceIds, ...removeMediumIds]) {
        tasks.push(deleteTaxonomyValue(selectedId, id))
      }
      if (state.orgType && state.orgType !== orgTypeSaved) {
        tasks.push(setOrgType(state.orgType).then(() => setOrgTypeSaved(state.orgType)))
      }

      await Promise.all(tasks)

      // Re-sync from the server so the editor reflects the true saved state.
      const [src, med] = await Promise.all([
        getTaxonomyValues(selectedId, 'utm_source'),
        getTaxonomyValues(selectedId, 'utm_medium'),
      ])
      setSourceValues(src)
      setMediumValues(med)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tracking foundation')
    } finally {
      setSaving(false)
    }
  }

  function handleSelectWorkspace(id: number) {
    setSelectedId(id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('workspace', String(id))
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Tracking Foundation"
        description="The shared sources and mediums your team reuses on every link. Edit them any time."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && clients.length === 0 ? (
        <div className="dot-grid-well rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            No workspaces yet. Create a workspace to build its tracking foundation.
          </p>
        </div>
      ) : (
        <>
          {clients.length > 1 && (
            <div className="flex max-w-xl items-center gap-3">
              <span className="eyebrow-sm">Workspace</span>
              <Select
                value={selectedId != null ? String(selectedId) : undefined}
                onValueChange={(v) => handleSelectWorkspace(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Choose a workspace" />
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

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>
                {clients.find((c) => c.id === selectedId)?.name ?? 'Workspace'} tracking foundation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {saved && (
                <Alert>
                  <AlertDescription>Tracking foundation saved.</AlertDescription>
                </Alert>
              )}
              <TrackingFoundation state={state} onChange={setState} />
              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving || selectedId == null}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {desired.sources.length} {desired.sources.length === 1 ? 'source' : 'sources'} ·{' '}
                  {desired.mediums.length} {desired.mediums.length === 1 ? 'medium' : 'mediums'}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
