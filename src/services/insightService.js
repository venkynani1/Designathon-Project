import { apiRequest } from '../utils/apiClient'

export function listInsights(batchId) {
  return apiRequest(`/batches/${batchId}/insights`)
}

export function generateInsight(batchId, payload = {}) {
  return apiRequest(`/batches/${batchId}/insights/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
