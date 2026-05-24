import { apiRequest } from '../utils/apiClient'

export function listNotifications(batchId) {
  const query = batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''
  return apiRequest(`/notifications${query}`)
}

export function createNotification(notification) {
  return apiRequest('/notifications', {
    method: 'POST',
    body: JSON.stringify(notification),
  })
}

export function listEmailLogs() {
  return apiRequest('/notifications/email-logs')
}

export function evaluateBatchNotifications(batchId, payload = {}) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/notifications/evaluate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
