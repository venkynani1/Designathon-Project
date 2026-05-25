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

export function createEmailNotification({
  batch,
  event,
  message,
  recipients = [],
  type,
  level = 'INFO',
  status = 'Pending',
}) {
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
      createEmailNotification({
        batch,
        event: 'attendance_missing_deadline_alert',
        level: 'WARNING',
        message: `Attendance is missing for ${batch.trainingName} after the ${options.deadlineLabel ?? '10:00 AM'} deadline.`,
        recipients: [batch.coordinatorSpoc ?? 'Coordinator'],
        type: 'Attendance',
      }),
    )
  }

  report.rows
    .filter((row) => row.consecutiveAbsences >= 3)
    .forEach((row) => {
      alerts.push(
        createEmailNotification({
          batch,
          event: 'three_day_absence',
          level: 'HIGH',
          message: `${row.name || row.email} has ${row.consecutiveAbsences} consecutive absences in ${batch.trainingName}.`,
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

  return createEmailNotification({
    batch,
    event: 'upcoming_assessment_reminder',
    message: `${assessment.name} is scheduled for ${assessment.date || 'the configured date'} in ${batch.trainingName}.`,
    recipients: recipients.length ? recipients : [batch.trainer?.email ?? batch.trainer?.name ?? 'Trainer'],
    status: 'Pending',
    type: 'Assessment',
  })
}

export function createAssessmentUploadNotification(batch, assessment, { uploadedBy = 'Trainer', recordCount = 0 } = {}) {
  return createEmailNotification({
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

  return createEmailNotification({
    batch,
    event: 'feedback_request',
    message: `Feedback is requested for ${batch.trainingName}.`,
    recipients: recipients.length ? recipients : ['Participants'],
    status: 'Pending',
    type: 'Feedback',
  })
}
