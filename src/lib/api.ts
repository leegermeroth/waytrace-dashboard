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
