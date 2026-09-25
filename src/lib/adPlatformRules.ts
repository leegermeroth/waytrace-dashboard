import type { AdCampaignTypeDto, AdMacroDto, AdParam, AdPlatformDto, AdPlatformId } from '@/lib/api'

/**
 * Pure ad-platform registry rules (AD_TRACKING_LINKS_PLAN.md §7).
 *
 * Deliberately free of runtime imports — only `import type`, which is erased at
 * build time — so these decisions are directly testable under `node --test`
 * without pulling in the API client (and its `import.meta.env`).
 *
 * These mirror the Worker's own predicates. The Worker remains authoritative:
 * it re-validates everything on save, so a drift here can only ever mean the UI
 * offers something the server then refuses — never the reverse. The tests in
 * tests/ad-platforms.test.ts pin the cases that would drift silently.
 */

/**
 * The ad-tracking discriminator, defined once (plan §7.6).
 *
 * ALWAYS compare link types with strict equality. 'tracking' is both an
 * existing production value AND a substring of 'ad_tracking', so
 * includes()/startsWith()/a LIKE would match both — and would hand an ad
 * tracking link the behaviour of an ordinary redirecting link: a short URL
 * built from the unroutable sentinel domain, a QR code encoding unresolved
 * macros, and a "0 clicks" reading that claims we measured no traffic rather
 * than that we measured none of it.
 */
export function isAdTrackingLink(link: { link_type?: string | null }): boolean {
  return link.link_type === 'ad_tracking'
}

export function findPlatform(
  platforms: AdPlatformDto[],
  id: AdPlatformId | ''
): AdPlatformDto | null {
  return platforms.find((p) => p.id === id) ?? null
}

/**
 * Whether a macro may be offered for a campaign type. Two distinct facts are
 * consulted, matching the Worker:
 *   1. macro.campaign_types — an allowlist for macros that exist ONLY for
 *      certain types ({assetgroupid} is Performance Max only);
 *   2. campaignType.unsupported_macros — a denylist for otherwise-general
 *      macros a type does NOT support (Google's Demand Gen exclusions).
 * A platform without campaign types (Meta) ignores campaignType entirely.
 */
export function isMacroAllowed(
  platform: AdPlatformDto,
  macro: AdMacroDto,
  campaignType: string | null
): boolean {
  if (!platform.campaign_types) return true
  if (macro.campaign_types && (!campaignType || !macro.campaign_types.includes(campaignType))) {
    return false
  }
  const type = platform.campaign_types.find((t) => t.id === campaignType)
  return !type?.unsupported_macros.includes(macro.id)
}

/** The macros to offer for this platform and campaign type. */
export function offerableMacros(platform: AdPlatformDto, campaignType: string | null): AdMacroDto[] {
  return platform.macros.filter((m) => isMacroAllowed(platform, m, campaignType))
}

/**
 * The recommended preset, resolved server-side per campaign type so the client
 * never has to know the preset rules — including that the Demand Gen preset
 * drops {network}, which Google does not support there.
 *
 * Cloned so editing the form never mutates the cached registry.
 */
export function presetFor(platform: AdPlatformDto, campaignType: string | null): AdParam[] {
  const key = platform.campaign_types ? (campaignType ?? '') : 'default'
  return structuredClone(platform.presets[key] ?? [])
}

/** Campaign types to show up front; `advanced` ones are vertical-specific. */
export function primaryCampaignTypes(platform: AdPlatformDto): AdCampaignTypeDto[] {
  return (platform.campaign_types ?? []).filter((t) => !t.advanced)
}

export function advancedCampaignTypes(platform: AdPlatformDto): AdCampaignTypeDto[] {
  return (platform.campaign_types ?? []).filter((t) => t.advanced)
}

/** Human label for a macro id, falling back to the id when unknown. */
export function macroLabel(platform: AdPlatformDto, macroId: string | undefined): string {
  if (!macroId) return ''
  return platform.macros.find((m) => m.id === macroId)?.label ?? macroId
}

/**
 * Read one `key=value` pair out of an already-built `key=value&key=value`
 * parameter string (AD_TRACKING_LINKS_GA4_PLAN.md §7). Used ONLY to display
 * the server-appended wt_link_id attribution value — this is reading a value
 * out of server output, not assembling one, so it does not conflict with "no
 * dashboard code constructs an ad-tracking URL" (plan §9.2/§408).
 */
export function extractParamValue(suffix: string, key: string): string | null {
  for (const pair of suffix.split('&')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    if (pair.slice(0, eq) === key) return pair.slice(eq + 1)
  }
  return null
}
