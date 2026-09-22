import { useMemo, useState } from 'react'
import type { AdMacroDto, AdParam, AdPlatformDto } from '@/lib/api'
import { offerableMacros } from '@/lib/adPlatforms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

/**
 * The tracking-parameter editor (brief §9: guide, don't dictate).
 *
 * A row is either a FIXED value the marketer types, or a PLATFORM value the ad
 * platform fills in at click time. The macro text itself is never editable — it
 * comes from the registry and the Worker re-derives it on save, so a typo can't
 * reach a live ad. What the marketer controls is which context to capture and
 * which query parameter receives it.
 */
export function AdParamEditor({
  platform,
  campaignType,
  params,
  onChange,
}: {
  platform: AdPlatformDto
  campaignType: string | null
  params: AdParam[]
  onChange: (next: AdParam[]) => void
}) {
  const [adding, setAdding] = useState(false)

  const available = useMemo(() => offerableMacros(platform, campaignType), [platform, campaignType])
  const macroById = useMemo(() => new Map(platform.macros.map((m) => [m.id, m])), [platform])
  const usedMacros = new Set(params.map((p) => p.macro).filter(Boolean))
  const unusedMacros = available.filter((m) => !usedMacros.has(m.id))

  function update(index: number, patch: Partial<AdParam>) {
    onChange(params.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function remove(index: number) {
    onChange(params.filter((_, i) => i !== index))
  }

  function addMacro(macro: AdMacroDto) {
    onChange([
      ...params,
      {
        key: suggestKey(macro, params),
        value: macro.syntax,
        type: 'platform_dynamic',
        macro: macro.id,
        enabled: true,
      },
    ])
    setAdding(false)
  }

  function addStatic() {
    onChange([...params, { key: '', value: '', type: 'static', enabled: true }])
    setAdding(false)
  }

  /**
   * A macro that is no longer offered for the selected campaign type. The row
   * stays visible and removable rather than vanishing — silently dropping a
   * parameter the marketer chose would be worse than showing why it cannot be
   * used.
   */
  function incompatible(param: AdParam): boolean {
    if (param.type !== 'platform_dynamic' || !param.macro) return false
    return !available.some((m) => m.id === param.macro)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {params.map((param, index) => {
          const macro = param.macro ? macroById.get(param.macro) : undefined
          const bad = incompatible(param)

          return (
            <div
              key={`${param.type}-${index}`}
              className={[
                'flex flex-wrap items-start gap-2 rounded-md border p-3',
                bad ? 'border-destructive/40 bg-destructive/5' : 'border-border',
                param.enabled ? '' : 'opacity-60',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={param.enabled}
                onChange={(e) => update(index, { enabled: e.target.checked })}
                aria-label={`Include ${param.key || 'parameter'}`}
                className="accent-ochre mt-2 size-4 shrink-0"
              />

              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={param.key}
                  onChange={(e) => update(index, { key: e.target.value.trim() })}
                  placeholder="utm_campaign"
                  aria-label="Parameter name"
                  className="font-mono text-xs sm:w-52"
                />

                <span className="hidden text-muted-foreground sm:inline">=</span>

                {param.type === 'platform_dynamic' ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <code className="truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                      {param.value}
                    </code>
                    <Badge variant="outline" className="shrink-0 text-[0.625rem]">
                      Dynamic
                    </Badge>
                  </div>
                ) : (
                  <Input
                    value={param.value}
                    onChange={(e) => update(index, { value: e.target.value })}
                    placeholder="paid_social"
                    aria-label="Parameter value"
                    className="flex-1"
                  />
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                aria-label={`Remove ${param.key || 'parameter'}`}
              >
                Remove
              </Button>

              {macro && !bad && (
                <p className="w-full text-xs text-muted-foreground">
                  {macro.label} — {macro.description}
                  {macro.warning ? ` ${macro.warning}` : ''}
                </p>
              )}
              {bad && (
                <p className="w-full text-xs text-destructive">
                  {macro?.label ?? param.macro} is not supported for this campaign type. Remove it,
                  or choose a different campaign type.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {params.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No parameters yet. Add at least one so the ad platform has something to report on.
        </p>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value=""
              onValueChange={(id) => {
                const macro = unusedMacros.find((m) => m.id === String(id))
                if (macro) addMacro(macro)
              }}
            >
              {/* Base UI's SelectValue falls back to the raw value, so the
                  trigger carries its own label. */}
              <SelectTrigger className="sm:w-72" aria-label="Add a platform value">
                <span className="flex flex-1 text-left text-muted-foreground">
                  {unusedMacros.length ? 'Add a platform value...' : 'All platform values added'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {unusedMacros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? ' - recommended' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="button" variant="outline" size="sm" onClick={addStatic}>
              Add a fixed value
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A platform value is filled in by {platform.label} when someone clicks the ad. A fixed
            value is the same on every click.
          </p>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add parameter
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * A sensible default query-parameter name for a newly added macro. Extra detail
 * gets the wt_ prefix so it never squats on a standard UTM field's meaning.
 */
function suggestKey(macro: AdMacroDto, existing: AdParam[]): string {
  const taken = new Set(existing.map((p) => p.key))
  const base = `wt_${macro.id}`
  if (!taken.has(base)) return base
  for (let n = 2; n < 50; n++) {
    if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
  }
  return base
}
