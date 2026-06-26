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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
