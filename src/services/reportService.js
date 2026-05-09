import { apiRequest } from '../utils/apiClient'

export function getConsolidatedReportData(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reports/consolidated-data`)
}

export function getAssessmentReportData(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reports/assessment-data`)
}

export function getTopperReportData(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reports/topper-data`)
}

export function getAttendanceReportData(batchId, source) {
  const query = source ? `?source=${encodeURIComponent(source)}` : ''
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reports/attendance-data${query}`)
}
