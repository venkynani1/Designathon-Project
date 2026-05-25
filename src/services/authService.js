import { apiRequest, clearAuthToken, setAuthToken } from '../utils/apiClient'

export function getAuthConfig() {
  return apiRequest('/auth/config')
}

export async function demoLogin(role) {
  const session = await apiRequest('/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ role }),
  })

  setAuthToken(session.token)
  return session
}

export function getCurrentUser() {
  return apiRequest('/auth/me')
}

export function logoutUser() {
  clearAuthToken()
}
