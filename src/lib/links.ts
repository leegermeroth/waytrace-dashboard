import type { Link } from '@/lib/api'

/**
 * The public short URL for a link. Uses the link's own stamped `domain` (the
 * domain it was created on and permanently answers on), falling back to the
 * shared default. The redirect appends UTMs server-side.
 */
export function shortUrl(link: Pick<Link, 'short_code' | 'domain'>): string {
  const domain = link.domain || 'waygo.to'
  return `https://${domain}/${link.short_code}`
}

/**
 * The URL a QR code should encode: the short URL plus a `?qr=1` marker. The
 * Worker's redirect handler records hits on this URL as *scans* rather than
 * *clicks*, so QR engagement is tracked separately from link clicks.
 */
export function scanUrl(link: Pick<Link, 'short_code' | 'domain'>): string {
  return `${shortUrl(link)}?qr=1`
}

/**
 * The URL to write to an NFC chip: the short URL plus a `?nfc=1` marker. The
 * Worker records hits on this URL with via='nfc' (a "tap"), counted into the
 * same scans counter as QR but split out in the dashboard.
 */
export function nfcUrl(link: Pick<Link, 'short_code' | 'domain'>): string {
  return `${shortUrl(link)}?nfc=1`
}

/**
 * Slugify a person's name into a Worker-valid person_slug: lowercase runs of
 * [a-z0-9] separated by single hyphens ("Katie Painter" -> "katie-painter").
 * Diacritics are stripped so "José" becomes "jose", not "jos".
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Prepend `https://` to a destination that was typed without a scheme, so
 * "example.com/page" is accepted instead of bounced by the Worker's http(s)
 * validation. Leaves an empty string, an existing http(s):// URL, or any other
 * explicit scheme (mailto:, tel:, …) untouched.
 */
export function normalizeDestinationUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel):/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** The five UTM columns a link carries, in canonical order. */
export interface UtmValues {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
}

/**
 * The fully-expanded tracking URL: the destination with UTM parameters appended
 * as query params. This is what the Worker actually redirects to (see the
 * redirect handler in the Worker's index.ts), so it's the canonical "tracking
 * URL" — usable directly even without going through the short link.
 *
 * Returns the raw destination unchanged if it isn't a parseable absolute URL, so
 * a half-typed destination in the batch form still previews something sensible.
 */
export function buildTrackingUrl(destination: string, utm: UtmValues): string {
  if (!destination) return ''
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return destination
  }
  const params: [keyof UtmValues, string | null | undefined][] = [
    ['utm_source', utm.utm_source],
    ['utm_medium', utm.utm_medium],
    ['utm_campaign', utm.utm_campaign],
    ['utm_term', utm.utm_term],
    ['utm_content', utm.utm_content],
  ]
  for (const [key, value] of params) {
    const trimmed = value?.trim()
    if (trimmed) url.searchParams.set(key, trimmed)
  }
  return url.toString()
}

/**
 * Run an async `fn` over `items` with a bounded number of in-flight calls, in
 * input order, collecting a settled result per item. Used by batch link
 * creation to fire the existing single-create endpoint a few rows at a time
 * without a Worker batch endpoint, while reporting per-row success/failure.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<{ value?: R; error?: unknown }[]> {
  const results: { value?: R; error?: unknown }[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { value: await fn(items[index], index) }
      } catch (error) {
        results[index] = { error }
      }
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(pool)
  return results
}
