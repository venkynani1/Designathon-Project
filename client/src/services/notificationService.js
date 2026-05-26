// Connects the client to the notificationService backend API capability.
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

export function sendEmailDiagnostics(to) {
  return apiRequest('/notifications/email-diagnostics', {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
}

function testEmailRoute(path, batchId, payload = {}) {
  return apiRequest(`/notifications/${path}`, {
    method: 'POST',
    body: JSON.stringify({ batchId, ...payload }),
  })
}

export function testTrainerReminder(batchId) {
  return testEmailRoute('test-trainer-reminder', batchId)
}

export function testFeedbackEmail(batchId, participantIds = []) {
  return testEmailRoute('test-feedback-email', batchId, { participantIds })
}

export function testPlacementEscalation(batchId) {
  return testEmailRoute('test-placement-escalation', batchId)
}

export function evaluateBatchNotifications(batchId, payload = {}) {
  return apiRequest(`/batches/${encodeURIComponent(batchId)}/notifications/evaluate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
