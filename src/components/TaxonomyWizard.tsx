import type { TaxonomyValue } from '@/lib/api'

/**
 * Shared building blocks for the "tracking foundation" setup surfaces — the
 * first-login onboarding wizard and the post-create workspace prompt both reuse
 * these so the platform → UTM mapping and its educational copy stay in one place.
 */

export interface Platform {
  id: string
  label: string
  source: string
  medium: string
}

/**
 * Common platforms mapped to their conventional utm_source / utm_medium. Freeform
 * values are always allowed elsewhere — this is a fast, consistent starting set.
 */
export const PLATFORMS: Platform[] = [
  { id: 'klaviyo',   label: 'Klaviyo (email)',  source: 'klaviyo',   medium: 'email' },
  { id: 'facebook',  label: 'Facebook',         source: 'facebook',  medium: 'organic-social' },
  { id: 'instagram', label: 'Instagram',        source: 'instagram', medium: 'organic-social' },
  { id: 'tiktok',    label: 'TikTok',           source: 'tiktok',    medium: 'organic-social' },
  { id: 'linkedin',  label: 'LinkedIn',         source: 'linkedin',  medium: 'organic-social' },
  { id: 'x',         label: 'X / Twitter',      source: 'x',         medium: 'organic-social' },
  { id: 'youtube',   label: 'YouTube',          source: 'youtube',   medium: 'organic-social' },
  { id: 'google',    label: 'Google Ads',       source: 'google',    medium: 'cpc' },
]

/** A short, plain-English gloss for each UTM field — the free-builder level of help. */
export const FIELD_HELP: Record<'utm_source' | 'utm_medium', string> = {
  utm_source: 'Where the click comes from — the specific platform or referrer, like facebook or klaviyo.',
  utm_medium: 'The channel type — how the traffic reaches you, like email, organic-social, or cpc.',
}

/** Derive the unique source + medium value sets to save from the picker state. */
export function deriveTaxonomy(
  selectedIds: Set<string>,
  paidSocial: boolean
): { sources: string[]; mediums: string[] } {
  const selected = PLATFORMS.filter((p) => selectedIds.has(p.id))
  const sources = [...new Set(selected.map((p) => p.source))]
  const mediums = [...new Set(selected.map((p) => p.medium))]
  if (paidSocial && !mediums.includes('paid-social')) mediums.push('paid-social')
  return { sources, mediums }
}

/**
 * Reverse-map a workspace's existing approved values back into picker state, so a
 * new workspace can be pre-filled from the previous one. Platforms whose source
 * is already approved are checked; paid-social presence flips the toggle.
 */
export function platformsFromTaxonomy(
  sourceValues: TaxonomyValue[],
  mediumValues: TaxonomyValue[]
): { selected: Set<string>; paidSocial: boolean } {
  const sources = new Set(sourceValues.map((v) => v.value.toLowerCase()))
  const selected = new Set(PLATFORMS.filter((p) => sources.has(p.source)).map((p) => p.id))
  const paidSocial = mediumValues.some((v) => v.value.toLowerCase() === 'paid-social')
  return { selected, paidSocial }
}

/** Muted chip used in the live preview of values that will be saved. */
function ValueChip({ children }: { children: string }) {
  return (
    <span className="mono inline-flex items-center rounded border border-border bg-cast px-1.5 py-0.5 text-[0.6875rem] text-foreground">
      {children}
    </span>
  )
}

/**
 * The platform checklist + paid-social toggle, per-field education, and a live
 * preview of the source/medium values that will be created. Purely controlled —
 * the parent owns the selection state and does the saving.
 */
export function PlatformPicker({
  selected,
  onToggle,
  paidSocial,
  onPaidSocialChange,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
  paidSocial: boolean
  onPaidSocialChange: (next: boolean) => void
}) {
  const { sources, mediums } = deriveTaxonomy(selected, paidSocial)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="eyebrow-sm">Platforms you use</p>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => {
            const isOn = selected.has(p.id)
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  isOn ? 'border-ochre bg-accent/50' : 'border-border hover:bg-accent/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-ochre"
                  checked={isOn}
                  onChange={() => onToggle(p.id)}
                />
                {p.label}
              </label>
            )
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40">
        <input
          type="checkbox"
          className="accent-ochre"
          checked={paidSocial}
          onChange={(e) => onPaidSocialChange(e.target.checked)}
        />
        <span>
          I also run paid social — add <span className="mono text-xs">paid-social</span> as a medium
        </span>
      </label>

      {/* Per-field education, same level as the free builder. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow-sm">utm_source</span>
          <span className="text-xs text-muted-foreground">{FIELD_HELP.utm_source}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow-sm">utm_medium</span>
          <span className="text-xs text-muted-foreground">{FIELD_HELP.utm_medium}</span>
        </div>
      </div>

      {/* Live preview of what gets saved. */}
      <div className="flex flex-col gap-2">
        <p className="eyebrow-sm">Approved values to be saved</p>
        {sources.length === 0 && mediums.length === 0 ? (
          <p className="font-serif text-[13px] text-muted-foreground italic">
            Pick a platform above to preview the values.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mono text-[0.625rem] tracking-[0.08em] text-slate uppercase">source</span>
              {sources.length ? sources.map((s) => <ValueChip key={s}>{s}</ValueChip>) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mono text-[0.625rem] tracking-[0.08em] text-slate uppercase">medium</span>
              {mediums.length ? mediums.map((m) => <ValueChip key={m}>{m}</ValueChip>) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
        )}
      </div>

      {/* Knowledge-center stub — wired to a future learn hub. */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
        More on building a UTM foundation — knowledge center coming soon.
      </p>
    </div>
  )
}
