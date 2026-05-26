// Connects the client to the participantService backend API capability.
import { apiRequest } from '../utils/apiClient'

export function getParticipantDashboard() {
  return apiRequest('/participant/dashboard')
}
