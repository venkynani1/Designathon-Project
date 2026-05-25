import { apiRequest } from '../utils/apiClient'

export function getParticipantDashboard() {
  return apiRequest('/participant/dashboard')
}
