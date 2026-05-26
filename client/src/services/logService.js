// Connects the client to the logService backend API capability.
import { apiRequest } from '../utils/apiClient'

export function listLogs() {
  return apiRequest('/logs')
}

export function listBatchLogs(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/logs`)
}

export function createLogRecord(log) {
  return apiRequest('/logs', {
    method: 'POST',
    body: JSON.stringify(log),
  })
}

export function updateLogStatus(logId, status) {
  return apiRequest(`/logs/${encodeURIComponent(logId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
