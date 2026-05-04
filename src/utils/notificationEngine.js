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
  level = 'INFO',
  message,
  recipient = 'Coordinator',
  status = 'Open',
  type,
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    batchId,
    category,
    createdAt: new Date().toISOString(),
    level,
    message,
    recipient,
    status,
    type: type ?? getDefaultType(action),
  }
}

export function createAttendanceAlerts(batch, report) {
  const alerts = []

  if (!report.dates.length) {
    alerts.push(
      createLogEntry({
        action: 'attendance_missing',
        batchId: batch.batchId,
        category: 'alert',
        level: 'WARNING',
        message: `Attendance is missing for ${batch.trainingName}.`,
        recipient: batch.coordinatorSpoc ?? 'Coordinator',
        status: 'Open',
        type: 'Attendance',
      }),
    )
  }

  report.rows
    .filter((row) => row.consecutiveAbsences >= 3)
    .forEach((row) => {
      alerts.push(
        createLogEntry({
          action: 'three_day_absence',
          batchId: batch.batchId,
          category: 'alert',
          level: 'HIGH',
          message: `${row.name || row.email} has ${row.consecutiveAbsences} consecutive absences.`,
          recipient: batch.trainer?.name ?? 'Trainer',
          status: 'Open',
          type: 'Absence',
        }),
      )
    })

  return alerts
}

export function createAssessmentReminder(batch, assessment) {
  return createLogEntry({
    action: 'assessment_reminder',
    batchId: batch.batchId,
    category: 'alert',
    level: 'INFO',
    message: `Assessment reminder created for ${assessment.name} on ${assessment.date || 'the configured date'}.`,
    recipient: batch.trainer?.name ?? 'Trainer',
    status: 'Scheduled',
    type: 'Assessment',
  })
}

export function createFeedbackTrigger(batch) {
  return createLogEntry({
    action: 'feedback_trigger',
    batchId: batch.batchId,
    category: 'alert',
    level: 'INFO',
    message: `Feedback has been triggered for ${batch.trainingName}.`,
    recipient: 'Participants',
    status: 'Sent',
    type: 'Feedback',
  })
}
