import { listAdPlatforms, type AdPlatformDto } from '@/lib/api'

/**
 * Ad platform registry access (AD_TRACKING_LINKS_PLAN.md D4).
 *
 * The Worker is the single source of truth for macro syntax; this build holds
 * NO copy of the macro lists. Never hardcode a macro string in a component —
 * a second copy would drift from the Worker's, which is exactly the
 * inconsistency this feature exists to eliminate.
 *
 * The registry is small, static per deploy, and needed by several components,
 * so it is fetched once and memoized for the session. A failed fetch is NOT
 * memoized, so a transient error can be retried.
 *
 * The pure rules live in ./adPlatformRules (no runtime imports, so they are
 * directly testable) and are re-exported here for convenience.
 */

let cache: Promise<AdPlatformDto[]> | null = null

export function loadAdPlatforms(): Promise<AdPlatformDto[]> {
  if (!cache) {
    cache = listAdPlatforms().catch((err) => {
      cache = null
      throw err
    })
  }
  return cache
}

export * from '@/lib/adPlatformRules'
