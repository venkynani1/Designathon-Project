import { apiRequest } from '../utils/apiClient'

function suffix(refresh) {
  return refresh ? '?refresh=true' : ''
}

export function getAiBatchSummary(batchId, refresh = false) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/ai-summary${suffix(refresh)}`)
}

export function getAiFeedbackAnalysis(batchId, refresh = false) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/ai-feedback-analysis${suffix(refresh)}`)
}

export function getAiTopperJustification(batchId, refresh = false) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/ai-topper-justification${suffix(refresh)}`)
}

export function getAiAnomalies(batchId, refresh = false) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/ai-anomalies${suffix(refresh)}`)
}
