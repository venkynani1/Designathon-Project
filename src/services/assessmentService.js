import { apiRequest } from '../utils/apiClient'

export function listAssessments(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/assessments`)
}

export function createAssessmentRecord(batchId, assessment) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/assessments`, {
    method: 'POST',
    body: JSON.stringify(assessment),
  })
}

export function updateAssessmentRecord(batchId, assessmentId, assessment) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/assessments/${encodeURIComponent(assessmentId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(assessment),
    },
  )
}

export function deleteAssessmentRecord(batchId, assessmentId) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/assessments/${encodeURIComponent(assessmentId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function uploadAssessmentResults(batchId, assessmentId, payload) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/assessments/${encodeURIComponent(assessmentId)}/results`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function createAssessmentEvidence(batchId, assessmentId, evidence) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/assessments/${encodeURIComponent(assessmentId)}/evidence`,
    {
      method: 'POST',
      body: JSON.stringify(evidence),
    },
  )
}

export function deleteAssessmentEvidence(batchId, assessmentId, evidenceId) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/assessments/${encodeURIComponent(assessmentId)}/evidence/${encodeURIComponent(evidenceId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function getAssessmentStatsRecord(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/assessments/stats`)
}

export function getAssessmentToppers(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/assessments/toppers`)
}
