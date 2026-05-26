const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000/api' : '')
const AUTH_TOKEN_KEY = 'mavericks_auth_token'

export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export async function apiRequest(path, options = {}) {
  if (!API_BASE_URL) {
    throw new ApiError('Frontend API URL is not configured. Set VITE_API_BASE_URL for this deployment.', 0)
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  })

  if (response.status === 204) {
    return null
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message ?? 'API request failed.'
    throw new ApiError(message, response.status, payload.error?.details ?? payload.details ?? [])
  }

  return payload.data ?? payload
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    return
  }

  localStorage.removeItem(AUTH_TOKEN_KEY)
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}
