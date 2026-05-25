import { apiRequest } from '../utils/apiClient'

export function getFeedback(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback`)
}

export function triggerFeedbackRecord(batchId, payload = {}) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/trigger`, {
    method: 'POST',
    body: JSON.stringify(payload),
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

export function closeFeedbackRecord(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/close`, {
    method: 'PATCH',
  })
}

export function submitParticipantFeedback(batchId, feedbackRunId, payload) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/feedback/${encodeURIComponent(feedbackRunId)}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
