import { apiRequest } from '../utils/apiClient'

export function listTrainerProfiles() {
  return apiRequest('/trainer-profiles')
}

export function createTrainerProfile(profile) {
  return apiRequest('/trainer-profiles', {
    method: 'POST',
    body: JSON.stringify(profile),
  })
}

export function updateTrainerProfile(profileId, profile) {
  return apiRequest(`/trainer-profiles/${encodeURIComponent(profileId)}`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
}

export function saveTrainerProfiles(trainers) {
  return apiRequest('/trainer-profiles', {
    method: 'PUT',
    body: JSON.stringify({ trainers }),
  })
}

export function deactivateTrainerProfile(profileId) {
  return apiRequest(`/trainer-profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  })
}
