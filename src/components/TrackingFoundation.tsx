import { useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import {
  MARKETING_CHANNELS,
  ORG_TYPES,
  FIELD_HELP,
  channelSelection,
  deriveFoundation,
  slugifySource,
  type ChannelSelection,
  type FoundationState,
  type MarketingChannel,
  type OrgType,
} from '@/lib/trackingFoundation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The shared Tracking Foundation editor: organization type, the expandable
 * marketing-channel multi-selects, the Meta source-naming preference, and a
 * live preview of the source/medium values that will be saved.
 *
 * It is purely controlled — the parent owns `state` and persists on its own
 * schedule. The onboarding wizard, the per-workspace settings editor, and the
 * new-workspace flow all render this same component so the model and its
 * education stay in one place.
 */
export interface TrackingFoundationProps {
  state: FoundationState
  onChange: (next: FoundationState) => void
  /** Show the organization-type selector (account-level; hide when editing a workspace). */
  showOrgType?: boolean
  /** Show the live source/medium preview. */
  showPreview?: boolean
}

export function TrackingFoundation({
  state,
  onChange,
  showOrgType = true,
  showPreview = true,
}: TrackingFoundationProps) {
  const { sources, mediums } = deriveFoundation(state)

  function setChannel(channelId: string, next: ChannelSelection) {
    onChange({ ...state, channels: { ...state.channels, [channelId]: next } })
  }

  function toggleChannel(channel: MarketingChannel) {
    const current = channelSelection(state, channel.id)
    const enabling = !current.enabled
    const nextChannels = {
      ...state.channels,
      [channel.id]: { ...current, enabled: enabling },
    }

    // Cross-channel convenience: enabling SMS pre-selects Klaviyo when it's
    // already an Email platform. Stays editable — the user can uncheck it.
    if (enabling && channel.id === 'sms') {
      const email = channelSelection(state, 'email')
      if (email.enabled && email.platforms.has('klaviyo')) {
        const sms = nextChannels['sms']
        const platforms = new Set(sms.platforms)
        platforms.add('klaviyo')
        nextChannels['sms'] = { ...sms, platforms }
      }
    }

    onChange({ ...state, channels: nextChannels })
  }

  function togglePlatform(channel: MarketingChannel, platformId: string) {
    const current = channelSelection(state, channel.id)
    const platforms = new Set(current.platforms)
    if (platforms.has(platformId)) platforms.delete(platformId)
    else platforms.add(platformId)

    const nextChannels = {
      ...state.channels,
      [channel.id]: { ...current, platforms },
    }

    // Selecting Klaviyo under Email pre-selects it under SMS when SMS is on.
    if (channel.id === 'email' && platformId === 'klaviyo' && platforms.has('klaviyo')) {
      const sms = channelSelection(state, 'sms')
      if (sms.enabled && !sms.platforms.has('klaviyo')) {
        const smsPlatforms = new Set(sms.platforms)
        smsPlatforms.add('klaviyo')
        nextChannels['sms'] = { ...sms, platforms: smsPlatforms }
      }
    }

    onChange({ ...state, channels: nextChannels })
  }

  function addCustom(channel: MarketingChannel, value: string) {
    const slug = slugifySource(value)
    if (!slug) return
    const current = channelSelection(state, channel.id)
    if (current.custom.some((c) => slugifySource(c) === slug)) return
    setChannel(channel.id, { ...current, custom: [...current.custom, value.trim()] })
  }

  function removeCustom(channel: MarketingChannel, index: number) {
    const current = channelSelection(state, channel.id)
    setChannel(channel.id, {
      ...current,
      custom: current.custom.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {showOrgType && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="tf_org_type">What best describes your organization?</Label>
          <Select
            value={state.orgType ?? undefined}
            onValueChange={(v) => onChange({ ...state, orgType: v as OrgType })}
          >
            <SelectTrigger id="tf_org_type" className="w-full sm:w-72">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {ORG_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            This helps us tailor suggestions over time. It never changes what you can build.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="eyebrow-sm">Marketing channels</p>
        <p className="text-xs text-muted-foreground">
          Turn on the channels your team builds tracked links for. We'll create matching source and
          medium values you can reuse on every campaign.
        </p>
        <div className="flex flex-col gap-2">
          {MARKETING_CHANNELS.map((channel) => (
            <ChannelSection
              key={channel.id}
              channel={channel}
              selection={channelSelection(state, channel.id)}
              metaSeparate={state.metaSeparatePlacements}
              orgType={state.orgType}
              onToggleChannel={() => toggleChannel(channel)}
              onTogglePlatform={(pid) => togglePlatform(channel, pid)}
              onAddCustom={(v) => addCustom(channel, v)}
              onRemoveCustom={(i) => removeCustom(channel, i)}
              onMetaSeparateChange={(next) =>
                onChange({ ...state, metaSeparatePlacements: next })
              }
            />
          ))}
        </div>
      </div>

      {/* Field education — the same level of help as the link builder. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow-sm">Source</span>
          <span className="text-xs text-muted-foreground">{FIELD_HELP.source}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow-sm">Medium</span>
          <span className="text-xs text-muted-foreground">{FIELD_HELP.medium}</span>
        </div>
      </div>

      {showPreview && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow-sm">Tracking values to be created</p>
          {sources.length === 0 && mediums.length === 0 ? (
            <p className="font-serif text-[13px] text-muted-foreground italic">
              Turn on a channel above to preview the values.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mono w-14 shrink-0 text-[0.625rem] tracking-[0.08em] text-slate uppercase">
                  source
                </span>
                {sources.map((s) => (
                  <ValueChip key={s}>{s}</ValueChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mono w-14 shrink-0 text-[0.625rem] tracking-[0.08em] text-slate uppercase">
                  medium
                </span>
                {mediums.map((m) => (
                  <ValueChip key={m}>{m}</ValueChip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChannelSection({
  channel,
  selection,
  metaSeparate,
  orgType,
  onToggleChannel,
  onTogglePlatform,
  onAddCustom,
  onRemoveCustom,
  onMetaSeparateChange,
}: {
  channel: MarketingChannel
  selection: ChannelSelection
  metaSeparate: boolean
  orgType: OrgType | null
  onToggleChannel: () => void
  onTogglePlatform: (platformId: string) => void
  onAddCustom: (value: string) => void
  onRemoveCustom: (index: number) => void
  onMetaSeparateChange: (next: boolean) => void
}) {
  const [customDraft, setCustomDraft] = useState('')
  const recommended = orgType != null && channel.recommendedFor?.includes(orgType)

  function commitCustom() {
    if (!customDraft.trim()) return
    onAddCustom(customDraft)
    setCustomDraft('')
  }

  return (
    <div
      className={`rounded-md border transition-colors ${
        selection.enabled ? 'border-ochre/60 bg-accent/30' : 'border-border'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          className="accent-ochre"
          checked={selection.enabled}
          onChange={onToggleChannel}
        />
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            {channel.checkboxLabel}
            {recommended && (
              <span className="mono rounded bg-ochre/15 px-1.5 py-0.5 text-[0.5625rem] tracking-[0.06em] text-ochre uppercase">
                Suggested
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{channel.description}</span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${
            selection.enabled ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </label>

      {selection.enabled && (
        <div className="flex flex-col gap-3 border-t border-border/60 px-3 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {channel.platforms.map((p) => {
              const on = selection.platforms.has(p.id)
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors ${
                    on ? 'border-ochre bg-background' : 'border-border hover:bg-accent/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-ochre"
                    checked={on}
                    onChange={() => onTogglePlatform(p.id)}
                  />
                  {p.label}
                </label>
              )
            })}
          </div>

          {/* Meta source naming — Paid Social only, shown when Meta is selected. */}
          {channel.hasMetaNaming && selection.platforms.has('meta') && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
              <span className="eyebrow-sm">Meta source naming</span>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name={`${channel.id}-meta`}
                  className="mt-0.5 accent-ochre"
                  checked={!metaSeparate}
                  onChange={() => onMetaSeparateChange(false)}
                />
                <span>
                  <span className="font-medium text-foreground">Recommended.</span> Use{' '}
                  <span className="mono">facebook</span> as the source for all Meta traffic.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name={`${channel.id}-meta`}
                  className="mt-0.5 accent-ochre"
                  checked={metaSeparate}
                  onChange={() => onMetaSeparateChange(true)}
                />
                <span>
                  <span className="font-medium text-foreground">Advanced.</span> Separate by placement
                  (<span className="mono">facebook</span>, <span className="mono">instagram</span>).
                </span>
              </label>
            </div>
          )}

          {/* Custom "Other…" platforms. */}
          {channel.supportsCustom && (
            <div className="flex flex-col gap-2">
              {selection.custom.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selection.custom.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="mono inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[0.6875rem]"
                    >
                      {slugifySource(c) || c}
                      <button
                        type="button"
                        onClick={() => onRemoveCustom(i)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${c}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitCustom()
                    }
                  }}
                  placeholder="Other… (add your own)"
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!customDraft.trim()}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ValueChip({ children }: { children: string }) {
  return (
    <span className="mono inline-flex items-center rounded border border-border bg-cast px-1.5 py-0.5 text-[0.6875rem] text-foreground">
      {children}
    </span>
  )
}
