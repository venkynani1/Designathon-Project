import { apiRequest } from '../utils/apiClient'

export function getFeedback(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback`)
}

export function triggerFeedbackRecord(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/trigger`, {
    method: 'POST',
  })
}

export function uploadFeedbackResponses(batchId, payload) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/responses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getFeedbackSummary(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/summary`)
}
