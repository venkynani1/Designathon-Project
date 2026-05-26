import { apiRequest } from '../utils/apiClient'

export function listBatches() {
  return apiRequest('/batches')
}

export function getBatch(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}`)
}

export function createBatchRecord(batch) {
  return apiRequest('/batches', {
    method: 'POST',
    body: JSON.stringify(batch),
  })
}

export function updateBatchRecord(previousBatchId, batch) {
  return apiRequest(`/batches/${encodeURIComponent(previousBatchId)}`, {
    method: 'PUT',
    body: JSON.stringify(batch),
  })
}

export function updateBatchStatus(batchId, status) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function getBatchLifecycle(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/lifecycle`)
}

export function updateAssessmentScoreDeadline(batchId, assessmentScoreDeadline) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/assessment-deadline`, {
    method: 'PATCH',
    body: JSON.stringify({ assessmentScoreDeadline }),
  })
}

export function sendAttendanceReminder(batchId, date, uploadDeadline) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reminders/attendance`, {
    method: 'POST',
    body: JSON.stringify({ date, uploadDeadline }),
  })
}

export function sendAssessmentReminder(batchId, assessment = {}) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reminders/assessment`, {
    method: 'POST',
    body: JSON.stringify({
      assessmentId: assessment.id ?? '',
      assessmentName: assessment.name ?? '',
      dueDate: assessment.dueDate ?? assessment.date ?? '',
    }),
  })
}

export function normalizeAssessmentScoreUploadDelivery(delivery = {}) {
  const recipients = (delivery.recipients ?? []).map((recipient) => ({
    ...recipient,
    status: ['Sent', 'Mock Sent'].includes(recipient.status)
      ? 'Sent'
      : recipient.status === 'Failed' ? 'Failed' : 'Skipped',
    generatedBy: recipient.generatedBy ?? 'fallback',
    provider: recipient.provider ?? '',
    messageId: recipient.messageId ?? '',
  }))
  if (!recipients.length) return { ...delivery, recipients }
  return {
    ...delivery,
    recipients,
    sent: recipients.filter((recipient) => recipient.status === 'Sent').length,
    failed: recipients.filter((recipient) => recipient.status === 'Failed').length,
    skipped: recipients.filter((recipient) => recipient.status === 'Skipped').length,
  }
}

export function sendAssessmentScoreUploadReminder(batchId, assessment = {}) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/reminders/assessment-score-upload`, {
    method: 'POST',
    body: JSON.stringify({
      assessmentName: assessment.assessmentName ?? assessment.name ?? '',
      dueDate: assessment.dueDate ?? assessment.date ?? '',
    }),
  }).then(normalizeAssessmentScoreUploadDelivery)
}

export function closeBatchRecord(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/close`, {
    method: 'PATCH',
  })
}

export function deleteBatchRecord(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
  })
}

export function listParticipants(batchId) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/participants`)
}

export function createParticipantRecord(batchId, participant) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/participants`, {
    method: 'POST',
    body: JSON.stringify(participant),
  })
}

export function uploadParticipantRecords(batchId, rows) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/participants/upload`, {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}

export function updateParticipantRecord(batchId, participantId, participant) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/participants/${encodeURIComponent(participantId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(participant),
    },
  )
}

export function deleteParticipantRecord(batchId, participantId) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/participants/${encodeURIComponent(participantId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function discontinueParticipant(batchId, participantId) {
  return apiRequest(
    `/batches/${encodeURIComponent(batchId)}/participants/${encodeURIComponent(participantId)}/discontinue`,
    {
      method: 'PATCH',
    },
  )
}
