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
}

export function registerAccount(email: string, password: string, name?: string) {
  return request<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
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
  account_id: number | null
  is_active: number
  created_at: string
}

export interface Link {
  id: number
  client_id: number
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
  link: { id: number; label: string | null; short_code: string; clicks: number }
  clicksByDay: { day: string; count: number }[]
  byCountry: { country: string; count: number }[]
  byDevice: { device_type: string; count: number }[]
}

export function listClients() {
  return request<Client[]>('/api/v1/clients')
}

export function createClient(name: string, slug: string, short_domain?: string) {
  return request<Client>('/api/v1/clients', {
    method: 'POST',
    body: JSON.stringify({ name, slug, short_domain: short_domain || undefined }),
  })
}

export function updateClient(
  id: number,
  input: { name: string; slug: string; short_domain?: string; is_active?: boolean }
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

export interface Me {
  id: number
  name: string
  email: string | null
  tier: string
  max_clients: number
  api_token: string | null
  subscription_status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

export function getMe() {
  return request<Me>('/api/v1/me')
}

export function changePassword(current_password: string, new_password: string) {
  return request<{ ok: boolean }>('/api/v1/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
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

export interface CustomDomain {
  id: number
  account_id: number
  hostname: string
  cf_custom_hostname_id: string
  cf_route_id: string | null
  status: 'pending' | 'active' | 'failed'
  created_at: string
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
