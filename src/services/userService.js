import { apiRequest } from '../utils/apiClient'

export function listUsers() {
  return apiRequest('/users')
}

export function createUser(user) {
  return apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  })
}

export function updateUser(userId, user) {
  return apiRequest(`/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  })
}

export function updateUserStatus(userId, status) {
  return apiRequest(`/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
