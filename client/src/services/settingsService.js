// Connects the client to the settingsService backend API capability.
import { apiRequest } from '../utils/apiClient'

export function getSystemSettings() {
  return apiRequest('/settings')
}

export function updateSystemSettings(settings) {
  return apiRequest('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}
