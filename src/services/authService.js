import { apiRequest, clearAuthToken } from '../utils/apiClient'

export function getCurrentUser() {
  return apiRequest('/auth/me')
}

export function logoutUser() {
  clearAuthToken()
}
