import type { TaxonomyValue } from '@/lib/api'

/**
 * The Tracking Foundation data model.
 *
 * Marketing channels are modelled as *configurable data*, not hardcoded UI, so
 * new channels can be added here without touching the wizard, the settings
 * editor, or the new-workspace flow — they all render from this list. A channel
 * groups the platforms a marketer intentionally builds links for, and maps each
 * one to its conventional utm_source / utm_medium.
 *
 * Waytrace only models channels where marketers *deliberately* build tracked
 * links. There is intentionally no "Organic Search / SEO" channel — you don't
 * hand-build UTM links for organic search.
 */

// ── Organization type ────────────────────────────────────────────────────────

/**
 * Stored on the account. Used for product analytics, email segmentation, and
 * light-touch (never heavy) onboarding suggestions — the wizard is not
 * customised per org type beyond a gentle recommended-channels hint.
 */
export const ORG_TYPES = [
  'Agency',
  'Ecommerce',
  'SaaS',
  'B2B',
  'Nonprofit',
  'Higher Education',
  'Healthcare',
  'Manufacturing',
  'Government',
  'Other',
] as const

export type OrgType = (typeof ORG_TYPES)[number]

// ── Channel + platform shapes ────────────────────────────────────────────────

export interface ChannelPlatform {
  id: string
  label: string
  /** The utm_source this platform contributes when selected. */
  source: string
  /**
   * Optional utm_medium override. When absent, the platform inherits its
   * channel's `medium`. Used by Print & Offline, where each format is really a
   * different medium (print / direct-mail / event).
   */
  medium?: string
}

export interface MarketingChannel {
  id: string
  /** Full name, e.g. "Email Marketing". */
  name: string
  /** The channel's enable checkbox label, e.g. "Email Marketing". */
  checkboxLabel: string
  /** One calm sentence of what this channel is for. */
  description: string
  /** The utm_medium this channel contributes (platforms may override). */
  medium: string
  platforms: ChannelPlatform[]
  /** Show the "Other…" custom platform input when true. */
  supportsCustom: boolean
  /**
   * Paid Social only: enables the Meta source-naming preference (recommended
   * single `facebook` source vs. advanced per-placement split).
   */
  hasMetaNaming?: boolean
  /**
   * Light-touch recommendation only. When the account's org type is in this
   * list we *suggest* the channel (a quiet hint) — we never auto-enable or
   * hide anything based on it.
   */
  recommendedFor?: OrgType[]
}

/** The single source of truth for the onboarding + settings channel list. */
export const MARKETING_CHANNELS: MarketingChannel[] = [
  {
    id: 'email',
    name: 'Email Marketing',
    checkboxLabel: 'Email Marketing',
    description: 'Newsletters, campaigns, and automated flows sent from your email platform.',
    medium: 'email',
    supportsCustom: true,
    recommendedFor: ['Ecommerce', 'Nonprofit', 'Higher Education', 'B2B'],
    platforms: [
      { id: 'klaviyo', label: 'Klaviyo', source: 'klaviyo' },
      { id: 'mailchimp', label: 'Mailchimp', source: 'mailchimp' },
      { id: 'hubspot', label: 'HubSpot', source: 'hubspot' },
      { id: 'sfmc', label: 'Salesforce Marketing Cloud', source: 'salesforce' },
      { id: 'constant-contact', label: 'Constant Contact', source: 'constant-contact' },
      { id: 'activecampaign', label: 'ActiveCampaign', source: 'activecampaign' },
      { id: 'brevo', label: 'Brevo', source: 'brevo' },
    ],
  },
  {
    id: 'sms',
    name: 'SMS',
    checkboxLabel: 'SMS Campaigns',
    description: 'Text-message campaigns and flows.',
    medium: 'sms',
    supportsCustom: true,
    recommendedFor: ['Ecommerce'],
    platforms: [
      { id: 'klaviyo', label: 'Klaviyo', source: 'klaviyo' },
      { id: 'postscript', label: 'Postscript', source: 'postscript' },
      { id: 'attentive', label: 'Attentive', source: 'attentive' },
      { id: 'simpletexting', label: 'SimpleTexting', source: 'simpletexting' },
      { id: 'ez-texting', label: 'EZ Texting', source: 'ez-texting' },
    ],
  },
  {
    id: 'paid-social',
    name: 'Paid Social',
    checkboxLabel: 'Paid Social',
    description: 'Paid placements and boosted posts across social networks.',
    medium: 'paid-social',
    supportsCustom: true,
    hasMetaNaming: true,
    recommendedFor: ['Ecommerce', 'SaaS', 'B2B'],
    platforms: [
      { id: 'meta', label: 'Meta (Facebook / Instagram)', source: 'facebook' },
      { id: 'linkedin', label: 'LinkedIn', source: 'linkedin' },
      { id: 'tiktok', label: 'TikTok', source: 'tiktok' },
      { id: 'pinterest', label: 'Pinterest', source: 'pinterest' },
      { id: 'reddit', label: 'Reddit', source: 'reddit' },
      { id: 'snapchat', label: 'Snapchat', source: 'snapchat' },
      { id: 'x', label: 'X', source: 'x' },
    ],
  },
  {
    id: 'organic-social',
    name: 'Organic Social',
    checkboxLabel: 'Organic Social',
    description: 'Unpaid posts and profile links across your social accounts.',
    medium: 'organic-social',
    supportsCustom: true,
    recommendedFor: ['Agency', 'Nonprofit', 'Higher Education'],
    platforms: [
      { id: 'facebook', label: 'Facebook', source: 'facebook' },
      { id: 'instagram', label: 'Instagram', source: 'instagram' },
      { id: 'linkedin', label: 'LinkedIn', source: 'linkedin' },
      { id: 'tiktok', label: 'TikTok', source: 'tiktok' },
      { id: 'x', label: 'X', source: 'x' },
      { id: 'youtube', label: 'YouTube', source: 'youtube' },
      { id: 'pinterest', label: 'Pinterest', source: 'pinterest' },
      { id: 'reddit', label: 'Reddit', source: 'reddit' },
      { id: 'threads', label: 'Threads', source: 'threads' },
      { id: 'bluesky', label: 'Bluesky', source: 'bluesky' },
    ],
  },
  {
    id: 'paid-search',
    name: 'Paid Search',
    checkboxLabel: 'Paid Search',
    description: 'Search-engine advertising.',
    medium: 'cpc',
    supportsCustom: true,
    recommendedFor: ['SaaS', 'B2B', 'Ecommerce'],
    platforms: [
      { id: 'google-ads', label: 'Google Ads', source: 'google' },
      { id: 'microsoft-ads', label: 'Microsoft Ads', source: 'bing' },
    ],
  },
  {
    id: 'print-offline',
    name: 'Print & Offline',
    checkboxLabel: 'Print & Offline Marketing',
    description: 'Anywhere you print or place a link in the physical world.',
    medium: 'print',
    supportsCustom: true,
    recommendedFor: ['Higher Education', 'Healthcare', 'Manufacturing', 'Government'],
    platforms: [
      { id: 'print', label: 'Print', source: 'print', medium: 'print' },
      { id: 'direct-mail', label: 'Direct Mail', source: 'direct-mail', medium: 'direct-mail' },
      { id: 'trade-shows', label: 'Trade Shows', source: 'tradeshow', medium: 'event' },
      { id: 'business-cards', label: 'Business Cards', source: 'business-card', medium: 'print' },
      { id: 'vehicle-graphics', label: 'Vehicle Graphics', source: 'vehicle', medium: 'print' },
    ],
  },
]

/** Plain-English gloss for the two governed fields — reused across surfaces. */
export const FIELD_HELP: Record<'source' | 'medium', string> = {
  source: 'Where the click comes from — the specific platform or referrer, like klaviyo, facebook, or google.',
  medium: 'How the link was delivered — the channel type, like email, sms, paid-social, or print.',
}

// ── Editable state ───────────────────────────────────────────────────────────

export interface ChannelSelection {
  enabled: boolean
  /** Selected built-in platform ids for this channel. */
  platforms: Set<string>
  /** Custom "Other…" platform names the user typed (raw text). */
  custom: string[]
}

export interface FoundationState {
  orgType: OrgType | null
  /** Keyed by channel id. Channels absent from the map are treated as disabled. */
  channels: Record<string, ChannelSelection>
  /**
   * Meta source naming. false (default, recommended) = one `facebook` source for
   * all Meta traffic. true (advanced) = split by placement (`facebook`,
   * `instagram`).
   */
  metaSeparatePlacements: boolean
}

/** An empty, nothing-selected starting state. */
export function emptyFoundation(): FoundationState {
  return { orgType: null, channels: {}, metaSeparatePlacements: false }
}

/** Read (or lazily default) a channel's selection from state. */
export function channelSelection(state: FoundationState, channelId: string): ChannelSelection {
  return state.channels[channelId] ?? { enabled: false, platforms: new Set(), custom: [] }
}

/** Normalise a free-typed custom platform into a utm_source-safe token. */
export function slugifySource(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Derivation (state → the values we actually save) ─────────────────────────

/** The Meta placement expansion: one source, or split by placement. */
function metaSources(separate: boolean): string[] {
  return separate ? ['facebook', 'instagram'] : ['facebook']
}

/**
 * Reduce the editable state to the unique, de-duplicated source + medium value
 * sets to persist. The same platform selected under two channels (e.g. Klaviyo
 * under both Email and SMS) yields one shared source (`klaviyo`) and both
 * mediums (`email`, `sms`) — automatically.
 */
export function deriveFoundation(state: FoundationState): { sources: string[]; mediums: string[] } {
  const sources = new Set<string>()
  const mediums = new Set<string>()

  for (const channel of MARKETING_CHANNELS) {
    const sel = channelSelection(state, channel.id)
    if (!sel.enabled) continue

    for (const platform of channel.platforms) {
      if (!sel.platforms.has(platform.id)) continue

      const medium = platform.medium ?? channel.medium
      if (channel.hasMetaNaming && platform.id === 'meta') {
        for (const s of metaSources(state.metaSeparatePlacements)) sources.add(s)
      } else {
        sources.add(platform.source)
      }
      mediums.add(medium)
    }

    for (const raw of sel.custom) {
      const s = slugifySource(raw)
      if (!s) continue
      sources.add(s)
      mediums.add(channel.medium)
    }
  }

  return { sources: [...sources].sort(), mediums: [...mediums].sort() }
}

/**
 * Every source/medium value the channel model can possibly produce. The
 * settings editor uses these so a save only ever *removes* values the model
 * governs — any custom or externally-added value outside this vocabulary is
 * preserved untouched rather than silently deleted on round-trip.
 */
export function modelVocabulary(): { sources: Set<string>; mediums: Set<string> } {
  const sources = new Set<string>()
  const mediums = new Set<string>()
  for (const channel of MARKETING_CHANNELS) {
    mediums.add(channel.medium)
    for (const platform of channel.platforms) {
      if (channel.hasMetaNaming && platform.id === 'meta') {
        sources.add('facebook')
        sources.add('instagram')
      } else {
        sources.add(platform.source)
      }
      if (platform.medium) mediums.add(platform.medium)
    }
  }
  return { sources, mediums }
}

/** Count of enabled channels — used for the review screen. */
export function enabledChannels(state: FoundationState): MarketingChannel[] {
  return MARKETING_CHANNELS.filter((c) => {
    const sel = channelSelection(state, c.id)
    return sel.enabled && (sel.platforms.size > 0 || sel.custom.some((v) => slugifySource(v)))
  })
}

// ── Reverse mapping (existing values → editable state) ────────────────────────

/**
 * Best-effort reconstruction of editable state from a workspace's already-saved
 * source/medium values — used to pre-fill the settings editor and the "copy
 * from another workspace" flow. Exact reversal isn't always possible (a source
 * can belong to several channels), so we enable a channel when its medium is
 * present and check every platform whose source is present under it.
 */
export function foundationFromValues(
  sourceValues: TaxonomyValue[],
  mediumValues: TaxonomyValue[],
  orgType: OrgType | null = null
): FoundationState {
  const sources = new Set(sourceValues.map((v) => v.value.toLowerCase()))
  const mediums = new Set(mediumValues.map((v) => v.value.toLowerCase()))

  const channels: Record<string, ChannelSelection> = {}
  let metaSeparatePlacements = false

  for (const channel of MARKETING_CHANNELS) {
    const platforms = new Set<string>()

    for (const platform of channel.platforms) {
      if (channel.hasMetaNaming && platform.id === 'meta') {
        if (sources.has('facebook')) {
          platforms.add('meta')
          if (sources.has('instagram')) metaSeparatePlacements = true
        }
        continue
      }
      const platformMedium = platform.medium ?? channel.medium
      if (sources.has(platform.source) && mediums.has(platformMedium)) {
        platforms.add(platform.id)
      }
    }

    // Enable the channel when its medium is present, even if no built-in
    // platform matched (the user may have only custom sources).
    const enabled = mediums.has(channel.medium) || platforms.size > 0
    if (enabled) {
      channels[channel.id] = { enabled: true, platforms, custom: [] }
    }
  }

  return { orgType, channels, metaSeparatePlacements }
}
