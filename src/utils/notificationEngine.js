function getDefaultType(action) {
  if (action.includes('attendance')) return 'Attendance'
  if (action.includes('assessment')) return 'Assessment'
  if (action.includes('feedback')) return 'Feedback'
  if (action.includes('absence')) return 'Absence'
  if (action.includes('export')) return 'Report'
  return 'Audit'
}

export function createLogEntry({
  action,
  batchId,
  category = 'audit',
  channel,
  event,
  level = 'INFO',
  message,
  recipient = 'Coordinator',
  recipients,
  status = 'Open',
  type,
}) {
  const resolvedRecipients = recipients ?? [recipient].filter(Boolean)

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    batchId,
    category,
    channel,
    createdAt: new Date().toISOString(),
    event: event ?? action,
    level,
    message,
    recipient,
    recipients: resolvedRecipients,
    status,
    type: type ?? getDefaultType(action),
  }
}

export function createMockEmailNotification({
  batch,
  event,
  message,
  recipients = [],
  type,
  level = 'INFO',
  status = 'Mock Sent',
}) {
  // TODO: integrate real email provider delivery and status callbacks.
  const recipientList = recipients.filter(Boolean)

  return createLogEntry({
    action: event,
    batchId: batch.batchId,
    category: 'notification',
    channel: 'Email',
    event,
    level,
    message,
    recipient: recipientList.join(', ') || 'Coordinator',
    recipients: recipientList,
    status,
    type,
  })
}

export function createAttendanceAlerts(batch, report, options = {}) {
  const alerts = []

  if (!report.dates.length && options.isAfterDeadline) {
    alerts.push(
      createMockEmailNotification({
        batch,
        event: 'attendance_missing_deadline_alert',
        level: 'WARNING',
        message: `Mock email alert would be sent to Training Coordinator: attendance is missing for ${batch.trainingName} after the ${options.deadlineLabel ?? '10:00 AM'} deadline.`,
        recipients: [batch.coordinatorSpoc ?? 'Coordinator'],
        type: 'Attendance',
      }),
    )
  }

  report.rows
    .filter((row) => row.consecutiveAbsences >= 3)
    .forEach((row) => {
      alerts.push(
        createMockEmailNotification({
          batch,
          event: 'three_day_absence',
          level: 'HIGH',
          message: `Mock email alert would be sent to Training Coordinator: ${row.name || row.email} has ${row.consecutiveAbsences} consecutive absences.`,
          recipients: [batch.coordinatorSpoc ?? 'Coordinator'],
          type: 'Absence',
        }),
      )
    })

  return alerts
}

export function createAssessmentReminder(batch, assessment) {
  const recipients = (batch.participants ?? [])
    .map((participant) => participant.officialEmail ?? participant.email ?? participant.name)
    .filter(Boolean)

  return createMockEmailNotification({
    batch,
    event: 'upcoming_assessment_reminder',
    message: `Mock email reminder would be sent to candidates for ${assessment.name} on ${assessment.date || 'the configured date'}.`,
    recipients: recipients.length ? recipients : [batch.trainer?.email ?? batch.trainer?.name ?? 'Trainer'],
    status: 'Mock Sent',
    type: 'Assessment',
  })
}

export function createAssessmentUploadNotification(batch, assessment, { uploadedBy = 'Trainer', recordCount = 0 } = {}) {
  return createMockEmailNotification({
    batch,
    event: 'assessment_upload_success',
    message: `Assessment scores uploaded for ${assessment.name} in ${batch.trainingName} by ${uploadedBy}. Records: ${recordCount}.`,
    recipients: [batch.coordinatorSpoc ?? 'Coordinator', 'Admin'],
    type: 'Assessment',
  })
}

export function createFeedbackTrigger(batch) {
  const recipients = (batch.participants ?? [])
    .map((participant) => participant.officialEmail ?? participant.email ?? participant.name)
    .filter(Boolean)

  return createMockEmailNotification({
    batch,
    event: 'feedback_request',
    message: `Mock feedback request email would be sent for ${batch.trainingName}.`,
    recipients: recipients.length ? recipients : ['Participants'],
    status: 'Mock Sent',
    type: 'Feedback',
  })
}
