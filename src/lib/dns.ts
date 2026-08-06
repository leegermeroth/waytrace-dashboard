/**
 * Compute the CNAME *record name* a customer should enter at their DNS provider,
 * relative to their registrable (root) domain — audit finding #34.
 *
 * The previous UI used `hostname.split('.')[0]`, which is only correct for a
 * single-label subdomain. For `go.eu.example.com` on the zone `example.com` the
 * correct record name is `go.eu`, not `go`. We derive it by stripping the
 * registrable domain (eTLD+1) using a compact set of common multi-part public
 * suffixes; anything unknown falls back to "last two labels are the root".
 *
 * Because a registrar's exact zone boundary can't be known from the browser,
 * the UI shows BOTH this relative name AND the full hostname (the audit's
 * sanctioned "display both" option), so the customer can match whichever field
 * their provider asks for.
 */

// Common second-level public suffixes (registrable domain = label + suffix).
// Not exhaustive — the full Public Suffix List is overkill for this hint; the
// UI always also shows the full hostname as a fallback.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'govt.nz',
  'co.za', 'org.za',
  'co.jp', 'or.jp', 'ne.jp',
  'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.hk', 'com.tr',
  'co.in', 'co.il', 'co.kr', 'co.id',
]);

/**
 * Returns the relative record name (subdomain portion), or '@' when the
 * hostname IS the registrable root (an apex, which needs a CNAME flattening /
 * ALIAS record rather than a labelled CNAME).
 */
export function dnsRelativeName(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return host || '@';

  const lastTwo = labels.slice(-2).join('.');
  // Registrable domain is the last 3 labels for a known two-level suffix,
  // otherwise the last 2 labels.
  const rootLabelCount = MULTI_PART_SUFFIXES.has(lastTwo) ? 3 : 2;

  if (labels.length <= rootLabelCount) return '@'; // hostname is the apex/root
  return labels.slice(0, labels.length - rootLabelCount).join('.');
}
