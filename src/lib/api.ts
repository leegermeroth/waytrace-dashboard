const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('waytrace_auth')
    if (!raw) return {}
    const { apiToken } = JSON.parse(raw)
    return apiToken ? { Authorization: `Bearer ${apiToken}` } : {}
  } catch {
    return {}
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  })

  const body: ApiEnvelope<T> | null = await res.json().catch(() => null)

  if (!res.ok || !body?.success) {
    const message = body?.error || `Request failed with status ${res.status}`
    throw new ApiError(message, res.status)
  }

  return body.data as T
}

export interface AuthResponse {
  api_token: string
  tier: string
  subscription_status: string
  // Present only when an invited Team user authenticates (login / accept-invite).
  // Absent for account-owner flows (owner is treated as full admin).
  role?: 'admin' | 'contributor'
  max_clients?: number
  name?: string
  email?: string
}

export function registerAccount(email: string, password: string, name?: string) {
  return request<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  })
}

export function acceptInvite(token: string, password: string, name?: string) {
  return request<AuthResponse>('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password, name: name || undefined }),
  })
}

export function loginAccount(email: string, password: string) {
  return request<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function setPassword(token: string, password: string) {
  return request<AuthResponse>('/api/v1/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export function forgotPassword(email: string) {
  return request<{ message: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token: string, password: string) {
  return request<AuthResponse>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export interface Client {
  id: number
  name: string
  slug: string
  short_domain: string | null
  // The workspace's current domain for NEW links (null = shared default waygo.to).
  link_domain: string | null
  account_id: number | null
  is_active: number
  created_at: string
  // GA4 mapping (v1.23) — the (login, property) this workspace's links report on.
  ga4_connection_id?: number | null
  ga4_property_id?: string | null
  ga4_property_name?: string | null
}

export interface Link {
  id: number
  client_id: number
  // The domain this link answers on, stamped at creation and permanent.
  domain: string
  short_code: string
  destination_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  label: string | null
  link_type: string
  is_active: number
  clicks: number
  scans: number
  created_at: string
  updated_at: string
  client_name?: string
  client_slug?: string
  short_domain?: string | null
}

export interface LinkInput {
  client_id: number
  short_code?: string
  destination_url: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  label?: string
  is_active?: boolean
  link_type?: string
}

export interface LinkStats {
  link: { id: number; label: string | null; short_code: string; clicks: number; scans: number }
  clicksByDay: { day: string; count: number }[]
  byCountry: { country: string; count: number }[]
  byDevice: { device_type: string; count: number }[]
}

export function listClients() {
  return request<Client[]>('/api/v1/clients')
}

export function createClient(name: string, slug: string, short_domain?: string, link_domain?: string | null) {
  return request<Client>('/api/v1/clients', {
    method: 'POST',
    body: JSON.stringify({ name, slug, short_domain: short_domain || undefined, link_domain: link_domain ?? undefined }),
  })
}

export function updateClient(
  id: number,
  input: { name: string; slug: string; short_domain?: string; link_domain?: string | null; is_active?: boolean }
) {
  return request<Client>(`/api/v1/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteClient(id: number) {
  return request<{ id: number }>(`/api/v1/clients/${id}`, {
    method: 'DELETE',
  })
}

export function listLinks(clientId?: number) {
  const query = clientId ? `?client_id=${clientId}` : ''
  return request<Link[]>(`/api/v1/links${query}`)
}

export function createLink(input: LinkInput) {
  return request<Link>('/api/v1/links', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateLink(id: number, input: Partial<LinkInput>) {
  return request<Link>(`/api/v1/links/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteLink(id: number) {
  return request<{ id: number }>(`/api/v1/links/${id}`, {
    method: 'DELETE',
  })
}

export function getLinkStats(id: number) {
  return request<LinkStats>(`/api/v1/links/${id}/stats`)
}

export interface DestinationHistoryEntry {
  id: number
  link_id: number
  old_destination: string
  new_destination: string
  changed_at: string
  changed_by_account_id: number | null
}

export function getLinkHistory(id: number) {
  return request<DestinationHistoryEntry[]>(`/api/v1/links/${id}/history`)
}

export interface TaxonomyValue {
  id: number
  field: string
  value: string
  created_at: string
}

export function getTaxonomyValues(clientId: number, field: string, q?: string) {
  const params = new URLSearchParams({ field })
  if (q) params.set('q', q)
  return request<TaxonomyValue[]>(`/api/v1/clients/${clientId}/taxonomy?${params}`)
}

export function addTaxonomyValue(clientId: number, field: string, value: string) {
  return request<TaxonomyValue>(`/api/v1/clients/${clientId}/taxonomy`, {
    method: 'POST',
    body: JSON.stringify({ field, value }),
  })
}

export function deleteTaxonomyValue(clientId: number, valueId: number) {
  return request<{ id: number }>(`/api/v1/clients/${clientId}/taxonomy/${valueId}`, {
    method: 'DELETE',
  })
}

export function batchTaxonomyValues(clientId: number, field: string, values: string[]) {
  return request<{ inserted: number }>(`/api/v1/clients/${clientId}/taxonomy/batch`, {
    method: 'POST',
    body: JSON.stringify({ field, values }),
  })
}

export function suggestLinkValues(clientId: number, field: string, q?: string) {
  const params = new URLSearchParams({ field })
  if (q) params.set('q', q)
  return request<string[]>(`/api/v1/clients/${clientId}/links/suggest?${params}`)
}

export interface Me {
  id: number
  name: string
  email: string | null
  tier: string
  max_clients: number
  // Present only for the account owner. Invited Team users never receive the
  // account's master token (the Worker strips it).
  api_token: string | null
  subscription_status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  subscription_started_at: string | null
  // ISO timestamp stamped once the account owner completes/skips the onboarding
  // wizard. NULL until then — how the first-login wizard gate is decided.
  onboarded_at: string | null
  // The account's self-reported organization type (Agency, Ecommerce, …).
  // NULL until set during onboarding. Used for analytics + light suggestions.
  org_type: string | null
  // 1 when this login may access the Platform Admin Console (/dashboard/platform/*).
  // Always 0 for invited Team users — the flag belongs to the owner's login only.
  is_platform_admin: number
  created_at: string
  // Present only when the caller is an invited Team user. Their presence is how
  // we tell an invited user apart from the account owner.
  user_id?: number
  role?: 'admin' | 'contributor'
}

export function getMe() {
  return request<Me>('/api/v1/me')
}

/** Stamp the one-time onboarding flag on the account (idempotent server-side). */
export function markOnboarded() {
  return request<{ onboarded_at: string | null }>('/api/v1/me/onboarded', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Set the account's organization type (Agency, Ecommerce, …). */
export function setOrgType(org_type: string) {
  return request<{ org_type: string | null }>('/api/v1/me/org-type', {
    method: 'POST',
    body: JSON.stringify({ org_type }),
  })
}

export function changePassword(current_password: string, new_password: string) {
  return request<{ ok: boolean }>('/api/v1/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  })
}

export function changeEmail(new_email: string) {
  return request<Me>('/api/v1/me/change-email', {
    method: 'POST',
    body: JSON.stringify({ new_email }),
  })
}

export function resendSetupEmail(session_id: string, email?: string) {
  return request<{ message: string; email: string }>('/api/v1/billing/resend-setup', {
    method: 'POST',
    body: JSON.stringify({ session_id, email }),
  })
}

/** Send an Enterprise sales inquiry (public endpoint — emailed to hello@waytrace.co). */
export function enterpriseInquiry(input: { name: string; email: string; company?: string; message?: string }) {
  return request<{ message: string }>('/api/v1/enterprise-inquiry', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      company: input.company || undefined,
      message: input.message || undefined,
    }),
  })
}

export function createCheckoutSession(price_id: string) {
  return request<{ url: string }>('/api/v1/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ price_id }),
  })
}

export function createPortalSession() {
  return request<{ url: string }>('/api/v1/billing/portal', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function cancelSubscription() {
  return request<{ refunded: boolean; deleted: boolean; effective: 'immediate' | 'period_end' }>(
    '/api/v1/billing/cancel',
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export interface CustomDomain {
  id: number
  account_id: number
  hostname: string
  cf_custom_hostname_id: string
  cf_route_id: string | null
  status: 'pending' | 'active' | 'failed'
  created_at: string
  // Number of links stamped with this domain (present on the list response).
  link_count?: number
}

export async function listDomains(): Promise<{ domains: CustomDomain[]; cnameTarget: string }> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/domains`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  })
  const body = await res.json() as { success: boolean; data: CustomDomain[]; cname_target: string; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? 'Failed to load domains')
  return { domains: body.data, cnameTarget: body.cname_target }
}

export async function createDomain(hostname: string): Promise<{ domain: CustomDomain; cnameTarget: string }> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ hostname }),
  })
  const body = await res.json() as { success: boolean; data: CustomDomain; cname_target: string; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? 'Failed to add domain')
  return { domain: body.data, cnameTarget: body.cname_target }
}

export function refreshDomainStatus(id: number) {
  return request<CustomDomain>(`/api/v1/domains/${id}/status`)
}

export function deleteDomain(id: number) {
  return request<{ id: number }>(`/api/v1/domains/${id}`, { method: 'DELETE' })
}

// ── Team users (multi-user management) ──────────────────────────────────────

export interface TeamUser {
  id: number
  account_id: number
  email: string
  name: string
  role: 'admin' | 'contributor'
  is_active: number
  status: 'active' | 'invited'
  created_at: string
}

export function listUsers() {
  return request<TeamUser[]>('/api/v1/users')
}

export function inviteUser(input: { email: string; name?: string; role?: 'admin' | 'contributor' }) {
  return request<TeamUser>('/api/v1/users/invite', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      name: input.name || undefined,
      role: input.role || undefined,
    }),
  })
}

export function updateUser(
  id: number,
  input: { role?: 'admin' | 'contributor'; name?: string; is_active?: boolean }
) {
  return request<TeamUser>(`/api/v1/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteUser(id: number) {
  return request<{ id: number }>(`/api/v1/users/${id}`, { method: 'DELETE' })
}

// ── Aggregate analytics ──────────────────────────────────────────────────────

export interface AnalyticsDimensionRow {
  key: string
  total: number
  clicks: number
  scans: number
}

export interface AnalyticsTopLink {
  id: number
  label: string
  short_code: string
  total: number
  clicks: number
  scans: number
}

export interface Analytics {
  totals: { total: number; clicks: number; scans: number }
  timeseries: { day: string; clicks: number; scans: number }[]
  bySource: AnalyticsDimensionRow[]
  byMedium: AnalyticsDimensionRow[]
  byCampaign: AnalyticsDimensionRow[]
  byWorkspace: AnalyticsDimensionRow[]
  topLinks: AnalyticsTopLink[]
}

export interface AnalyticsFilters {
  client_id?: number
  source?: string
  medium?: string
  campaign?: string
  from?: string
  to?: string
}

export function getAnalytics(filters: AnalyticsFilters = {}) {
  const params = new URLSearchParams()
  if (filters.client_id) params.set('client_id', String(filters.client_id))
  if (filters.source) params.set('source', filters.source)
  if (filters.medium) params.set('medium', filters.medium)
  if (filters.campaign) params.set('campaign', filters.campaign)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const query = params.toString()
  return request<Analytics>(`/api/v1/analytics${query ? `?${query}` : ''}`)
}

// ── WordPress plugin download ────────────────────────────────────────────────

export interface PluginInfo {
  version: string
  min_wp_version: string | null
  min_php_version: string | null
  tested_wp_version: string | null
  changelog: string | null
  // Pre-built, token-authenticated download URL for the current release zip.
  download_url: string
}

/** Current waytrace-pro release for this account (null if ineligible / no release). */
export function getPluginInfo() {
  return request<PluginInfo | null>('/api/v1/updates/waytrace-pro')
}

// ── GA4 integration (v1.23) ──────────────────────────────────────────────────

export interface Ga4Connection {
  id: number
  google_email: string
  status: string
  created_at: string
}

export interface Ga4Property {
  connection_id: number
  google_email: string
  property_id: string
  property_name: string
  ga_account_name: string
}

/** Connected Google logins for this account (no tokens exposed). */
export function getGa4Connections() {
  return request<Ga4Connection[]>('/api/v1/integrations/ga4')
}

/** Google consent URL to add (or reconnect) a login. Redirect the browser to it. */
export function getGa4AuthUrl() {
  return request<{ url: string }>('/api/v1/integrations/ga4/auth-url')
}

/** Every GA4 property across all connected logins, tagged with its connection. */
export function getGa4Properties() {
  return request<{ properties: Ga4Property[]; errors: { connection_id: number; google_email: string; error: string }[] }>(
    '/api/v1/integrations/ga4/properties'
  )
}

/** Assign a workspace's (connection, property) mapping, or clear it with null. */
export function setWorkspaceGa4Property(
  clientId: number,
  mapping: { connection_id: number; property_id: string; property_name: string } | null
) {
  return request<{ client_id: number; ga4_property_id: string | null }>(
    `/api/v1/integrations/ga4/workspaces/${clientId}`,
    { method: 'PUT', body: JSON.stringify(mapping ?? {}) }
  )
}

/** Disconnect one Google login. */
export function disconnectGa4(connectionId: number) {
  return request<{ id: number }>(`/api/v1/integrations/ga4/${connectionId}`, { method: 'DELETE' })
}

// ── GA4 reporting (post-click data) ──────────────────────────────────────────

export interface Ga4DimensionRow {
  key: string
  sessions: number
  keyEvents: number
  revenue: number
}

export interface Ga4Aggregate {
  connected: boolean
  mappedWorkspaces: number
  unmappedWorkspaces: number
  totals: { sessions: number; engagedSessions: number; keyEvents: number; revenue: number }
  bySource: Ga4DimensionRow[]
  byMedium: Ga4DimensionRow[]
  byCampaign: Ga4DimensionRow[]
  byLink: { link_id: number; sessions: number; keyEvents: number; revenue: number }[]
  errors: { google_email: string; error: string }[]
}

/** Aggregate GA4 post-click data, joined to links by UTM. Same filters as getAnalytics. */
export function getGa4Analytics(filters: AnalyticsFilters = {}) {
  const params = new URLSearchParams()
  if (filters.client_id) params.set('client_id', String(filters.client_id))
  if (filters.source) params.set('source', filters.source)
  if (filters.medium) params.set('medium', filters.medium)
  if (filters.campaign) params.set('campaign', filters.campaign)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const query = params.toString()
  return request<Ga4Aggregate>(`/api/v1/analytics/ga4${query ? `?${query}` : ''}`)
}

export interface Ga4LinkReport {
  available: boolean
  reason?: 'no_property' | 'no_connection' | 'no_utms' | 'error'
  property_name?: string
  totals?: { sessions: number; engagedSessions: number; keyEvents: number; revenue: number }
  timeseries?: { day: string; sessions: number; keyEvents: number }[]
  // Present only on by='variant' requests: the same utm_id join disaggregated
  // by utm_content (GA4 sessionManualAdContent) — keys are variant stamps.
  byContent?: Ga4DimensionRow[]
  error?: string
}

/**
 * Post-click GA4 metrics for one link (matched by its stamped utm_id).
 * by='variant' swaps the daily timeseries for a per-utm_content breakdown
 * (the A/B panel's GA4 columns).
 */
export function getLinkGa4(id: number, from?: string, to?: string, by?: 'variant') {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (by) params.set('by', by)
  const query = params.toString()
  return request<Ga4LinkReport>(`/api/v1/links/${id}/ga4${query ? `?${query}` : ''}`)
}

// ── A/B testing: weighted destination variants (enterprise, v1.27) ───────────
// A link with active variants redirects each hit to a weighted-random variant's
// destination_url, stamping the variant's auto-generated utm_content in place
// of the link's own (utm_id stays the link's ga4_id — utm_content is the GA4
// disaggregator). Stamps are immutable once created; deleting/deactivating all
// variants restores normal link behavior automatically. Enterprise-only, same
// Worker gate as collections; contributors are read-only.

export interface LinkVariant {
  id: number
  link_id: number
  label: string
  destination_url: string
  // Relative weight (positive integer, not %-validated) — effective share =
  // weight / sum of active variants' weights.
  weight: number
  // Auto-generated stamp ('variant-a', …), unique per link, immutable.
  utm_content: string
  is_active: number
  created_at: string
}

export interface VariantWithStats extends LinkVariant {
  clicks: number
  scans: number
  // NFC share of scans (via='nfc'), mirroring the collections taps split.
  taps: number
}

export interface VariantStats {
  variants: VariantWithStats[]
  // Hits with no variant attribution: pre-A/B history, hits while no variant
  // was active, and hits whose variant has since been deleted.
  no_variant: { clicks: number; scans: number; taps: number }
}

export interface VariantInput {
  label: string
  destination_url: string
  weight?: number
  is_active?: boolean
}

export function listVariants(linkId: number) {
  return request<LinkVariant[]>(`/api/v1/links/${linkId}/variants`)
}

/** The utm_content stamp is generated server-side and cannot be supplied. */
export function createVariant(linkId: number, input: VariantInput) {
  return request<LinkVariant>(`/api/v1/links/${linkId}/variants`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateVariant(linkId: number, variantId: number, input: Partial<VariantInput>) {
  return request<LinkVariant>(`/api/v1/links/${linkId}/variants/${variantId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteVariant(linkId: number, variantId: number) {
  return request<{ id: number }>(`/api/v1/links/${linkId}/variants/${variantId}`, {
    method: 'DELETE',
  })
}

/** Per-variant clicks/scans/taps from link_clicks.variant_id + the remainder. */
export function getVariantStats(linkId: number) {
  return request<VariantStats>(`/api/v1/links/${linkId}/variants/stats`)
}

// ── Asset collections (enterprise tier, v1.26) ───────────────────────────────
// ONE collection engine behind two pages: Packaging (type='product') and Team
// Cards (type='person', Session 4). An asset = one link + typed metadata; the
// link's ga4_id is stamped from the SKU / person slug so GA4 sessions/revenue
// join per SKU/person. Person assets carry destination_mode: 'redirect'
// follows destination_url; 'vcard' serves a contact card at the short URL.

/**
 * What links.destination_url holds for a vcard-mode asset with no fallback URL
 * (the Worker's placeholder — never actually served). Used to detect "no real
 * destination yet" when toggling a card to redirect mode.
 */
export const VCARD_PLACEHOLDER_URL = 'https://waytrace.co/'

export interface AssetCollection {
  id: number
  client_id: number
  name: string
  type: 'product' | 'person'
  created_at: string
  client_name?: string
  asset_count?: number
}

/** An asset row joined to its link (short link + clicks/scans counters). */
export interface CollectionAsset {
  id: number
  collection_id: number
  link_id: number
  sku: string | null
  product_name: string | null
  variant: string | null
  upc: string | null
  person_name: string | null
  person_slug: string | null
  title: string | null
  email: string | null
  phone: string | null
  destination_mode: 'redirect' | 'vcard'
  created_at: string
  updated_at: string
  // Joined link fields
  domain: string
  short_code: string
  destination_url: string
  ga4_id: string | null
  label: string | null
  clicks: number
  // QR + NFC hits combined (the Worker's one scans counter, §10 item 2)…
  scans: number
  // …with the NFC share broken out (link_clicks.via='nfc'), so QR-only =
  // scans - taps. Present on collection detail; absent on bulk-create results.
  taps?: number
  is_active: number
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
}

export interface CollectionDetail extends AssetCollection {
  assets: CollectionAsset[]
}

/** One product row for asset creation (single or bulk). */
export interface AssetRowInput {
  sku: string
  product_name: string
  variant?: string | null
  upc?: string | null
  destination_url: string
}

/**
 * One person row (Team Cards). destination_mode is optional — the Worker
 * honors an explicit value, else infers 'redirect' when destination_url is
 * present and 'vcard' when it isn't. destination_url is required for redirect
 * mode and an optional fallback for vcard mode.
 */
export interface PersonRowInput {
  person_name: string
  person_slug: string
  title?: string | null
  email?: string | null
  phone?: string | null
  destination_mode?: 'redirect' | 'vcard'
  destination_url?: string | null
}

/** Per-row validation error from the bulk endpoint (row is 0-based). */
export interface BulkRowError {
  row: number
  field?: string
  message: string
}

/** Bulk import cap enforced by the Worker (D1 batch limits — 2 statements/row). */
export const BULK_ROW_CAP = 200

export function listCollections(clientId?: number) {
  const query = clientId ? `?client_id=${clientId}` : ''
  return request<AssetCollection[]>(`/api/v1/collections${query}`)
}

export function createCollection(input: { client_id: number; name: string; type?: 'product' | 'person' }) {
  return request<AssetCollection>('/api/v1/collections', {
    method: 'POST',
    body: JSON.stringify({ client_id: input.client_id, name: input.name, type: input.type ?? 'product' }),
  })
}

export function getCollection(id: number) {
  return request<CollectionDetail>(`/api/v1/collections/${id}`)
}

export function renameCollection(id: number, name: string) {
  return request<AssetCollection>(`/api/v1/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

/** Deletes the collection AND all its assets' links (they stop resolving). */
export function deleteCollection(id: number) {
  return request<{ id: number }>(`/api/v1/collections/${id}`, { method: 'DELETE' })
}

export function createAsset(
  collectionId: number,
  input: (AssetRowInput | PersonRowInput) & { utm_source?: string; utm_medium?: string; utm_campaign?: string }
) {
  return request<CollectionAsset>(`/api/v1/collections/${collectionId}/assets`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * All-or-nothing bulk create: every row is validated first; any invalid row
 * fails the whole call with per-row errors (ApiError.status 400) and nothing
 * is created. Callers should surface `errors` from the failure body — use
 * bulkCreateAssets' thrown BulkValidationError.
 */
export class BulkValidationError extends ApiError {
  errors: BulkRowError[]
  constructor(message: string, status: number, errors: BulkRowError[]) {
    super(message, status)
    this.errors = errors
  }
}

export async function bulkCreateAssets(
  collectionId: number,
  rows: (AssetRowInput | PersonRowInput)[],
  utm?: { utm_source?: string; utm_medium?: string; utm_campaign?: string }
): Promise<{ created: number; assets: CollectionAsset[] }> {
  const res = await fetch(`${API_URL}/api/v1/collections/${collectionId}/assets/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ rows, ...utm }),
  })
  const body = await res.json().catch(() => null) as
    | { success: boolean; data?: { created: number; assets: CollectionAsset[] }; error?: string; errors?: BulkRowError[] }
    | null
  if (!res.ok || !body?.success || !body.data) {
    const message = body?.error || `Request failed with status ${res.status}`
    if (body?.errors?.length) throw new BulkValidationError(message, res.status, body.errors)
    throw new ApiError(message, res.status)
  }
  return body.data
}

/**
 * Edit an asset's typed fields (product or person, per its collection's type).
 * A SKU/slug change also re-stamps the link's ga4_id. destination_mode edits
 * ride this endpoint; an explicit '' clears an optional person field.
 */
export function updateAsset(
  collectionId: number,
  assetId: number,
  input: Partial<AssetRowInput> | Partial<PersonRowInput>
) {
  return request<CollectionAsset>(`/api/v1/collections/${collectionId}/assets/${assetId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Deletes the asset AND its link (the short link stops resolving). */
export function deleteAsset(collectionId: number, assetId: number) {
  return request<{ id: number }>(`/api/v1/collections/${collectionId}/assets/${assetId}`, {
    method: 'DELETE',
  })
}

// ── Platform Admin Console (is_platform_admin only, v1.24) ───────────────────

export interface AdminAccount {
  id: number
  name: string
  email: string | null
  tier: string
  max_clients: number
  subscription_status: string
  is_platform_admin: number
  is_active: number
  created_at: string
  client_count: number
  link_count: number
  total_clicks: number
  total_scans: number
  last_activity: string | null
}

export interface PlatformStats {
  totals: {
    accounts: number
    active_subscriptions: number
    workspaces: number
    links: number
    clicks: number
    scans: number
    domains: number
  }
  accounts_by_tier: { tier: string; count: number }[]
}

export interface ProvisionedAccount {
  id: number
  name: string
  email: string
  tier: string
  max_clients: number
  subscription_status: string
  created_at: string
  // False when the Worker couldn't send the setup email (missing Resend config).
  email_sent: boolean
}

/** Create an Enterprise account (tier='enterprise') and send the setup-password email. */
export function provisionEnterpriseAccount(input: { name: string; email: string; max_clients?: number }) {
  return request<ProvisionedAccount>('/api/v1/admin/provision', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      max_clients: input.max_clients ?? undefined,
    }),
  })
}

/** All accounts with per-account rollups (workspaces, links, hits, last activity). */
export function listAdminAccounts() {
  return request<AdminAccount[]>('/api/v1/admin/accounts')
}

/** Platform-wide totals. */
export function getPlatformStats() {
  return request<PlatformStats>('/api/v1/admin/stats')
}
