// Connects the client to the attendanceService backend API capability.
import { apiRequest } from '../utils/apiClient'

export function listAttendanceSessions(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/attendance`)
}

export function uploadAttendanceSessions(batchId, payload) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/attendance/sessions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAttendanceReport(batchId, source) {
  const query = source ? `?source=${encodeURIComponent(source)}` : ''
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/attendance/report${query}`)
}

export function getUnmatchedAttendanceRecords(batchId, source) {
  const query = source ? `?source=${encodeURIComponent(source)}` : ''
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/attendance/unmatched${query}`)
}

export function deleteAttendanceSession(batchId, sessionId) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/attendance/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    },
  )
}
