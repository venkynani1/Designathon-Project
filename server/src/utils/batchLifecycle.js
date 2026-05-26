const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateText(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  return toDate(value)?.toISOString().slice(0, 10) ?? ''
}

function parseStartTimeMinutes(timings = '') {
  const match = String(timings).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!match) return 9 * 60

  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  const meridiem = match[3]?.toUpperCase()

  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return hours * 60 + minutes
}

function deadlineForTrainingDate(batch, date) {
  const [year, month, day] = date.split('-').map(Number)
  const startMinutes = parseStartTimeMinutes(batch.timings)
  return new Date(Date.UTC(year, month - 1, day, 0, startMinutes + 15, 0, 0))
}

function getTrainingDates(batch) {
  if (batch.scheduleType === 'Custom Dates' && batch.customDates) {
    return String(batch.customDates)
      .split(',')
      .map((item) => dateText(item.trim()))
      .filter(Boolean)
  }

  const start = toDate(`${dateText(batch.startDate)}T00:00:00.000Z`)
  const end = toDate(`${dateText(batch.endDate)}T00:00:00.000Z`)
  if (!start || !end) return []

  const dates = []
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function getBatchCode(batch) {
  return batch.batchId ?? batch.batchCode ?? batch.id ?? ''
}

function getLogsForBatch(logs, batch) {
  const batchCode = getBatchCode(batch)
  return (logs ?? []).filter((log) => log.batchId === batchCode || log.batchCode === batchCode)
}

function logUpdatedAt(log) {
  return log?.createdAt ?? log?.updatedAt ?? ''
}

function latest(values) {
  return values.filter(Boolean).sort().at(-1) ?? ''
}

function hasAction(logs, includes) {
  return logs.some((log) => String(log.action ?? '').includes(includes))
}

export function getAttendanceLifecycleStatus(batch, logs = [], now = new Date()) {
  const batchLogs = getLogsForBatch(logs, batch)
  const trainingDates = getTrainingDates(batch)
  const sessions = batch.attendanceSessions ?? batch.attendance ?? []
  const uploadedDates = new Set()
  let hasLateUpload = false
  let hasUpload = false

  for (const session of sessions) {
    const sessionDate = dateText(session.sessionDate ?? session.date)
    if (!sessionDate) continue
    uploadedDates.add(sessionDate)
    hasUpload = true

    const uploadedAt = toDate(session.uploadedAt) ?? now
    if (uploadedAt > deadlineForTrainingDate(batch, sessionDate)) {
      hasLateUpload = true
    }
  }

  if (!hasUpload && hasAction(batchLogs, 'attendance_upload')) {
    hasUpload = true
  }

  const reminderTriggered =
    batch.attendanceReminderTriggered ||
    hasAction(batchLogs, 'attendance_reminder')

  if (hasUpload && hasLateUpload) return 'Uploaded Late'
  if (hasUpload) return 'Uploaded On Time'
  if (reminderTriggered) return 'Reminder Triggered'

  const anyPastDeadline = trainingDates.some((date) => now > deadlineForTrainingDate(batch, date))
  if (anyPastDeadline) return 'Missing'

  return 'Pending'
}

export function getAssessmentLifecycleStatus(batch, _logs = [], now = new Date()) {
  const assessments = batch.assessments ?? []
  const deadline = toDate(batch.assessmentScoreDeadline)
  const results = assessments.flatMap((assessment) => assessment.results ?? [])
  const latestUpload = latest([
    ...assessments.map((assessment) => assessment.uploadedAt),
    ...results.map((result) => result.uploadedAt),
  ])

  if (!assessments.length) return 'Not Started'
  if (!results.length) {
    if (deadline && now > deadline) return 'Overdue'
    return deadline ? 'Score Upload Pending' : 'Assessment Created'
  }

  if (!deadline) return 'Assessment Created'
  return toDate(latestUpload) && toDate(latestUpload) <= deadline
    ? 'Uploaded Before Deadline'
    : 'Uploaded Late'
}

export function getFeedbackLifecycleStatus(batch) {
  const feedback = batch.feedbackRuns?.[0] ?? batch.feedback ?? {}
  const responses = feedback.responses ?? []

  if (feedback.summary && feedback.summary !== 'Feedback has not been uploaded yet.') {
    return 'Summary Available'
  }
  if (responses.length || feedback.uploadedAt) return 'Responses Uploaded'
  if (feedback.triggeredAt) return 'Triggered'
  return 'Pending'
}

export function getTopperReportLifecycleStatus(batch, logs = []) {
  const batchLogs = getLogsForBatch(logs, batch)
  const hasTopper = (batch.assessments ?? []).some((assessment) =>
    (assessment.results ?? []).some((result) => result.cleared || Number(result.scorePercent) >= 0),
  )
  const reportExported =
    batch.consolidatedReportExported ||
    hasAction(batchLogs, 'consolidated_report_export')

  if (hasTopper && reportExported) return 'Completed'
  if (reportExported) return 'Report Exported'
  if (hasTopper) return 'Topper Identified'
  return 'Pending'
}

export function getBatchCloseReadiness(batch, logs = [], now = new Date()) {
  const attendanceStatus = getAttendanceLifecycleStatus(batch, logs, now)
  const assessmentStatus = getAssessmentLifecycleStatus(batch, logs, now)
  const feedbackStatus = getFeedbackLifecycleStatus(batch, logs)
  const topperStatus = getTopperReportLifecycleStatus(batch, logs)
  const ready =
    attendanceStatus !== 'Pending' &&
    attendanceStatus !== 'Missing' &&
    assessmentStatus !== 'Not Started' &&
    assessmentStatus !== 'Score Upload Pending' &&
    assessmentStatus !== 'Overdue' &&
    feedbackStatus !== 'Pending' &&
    (topperStatus === 'Completed' || topperStatus === 'Report Exported')

  return {
    ready,
    status: batch.status === 'Closed' ? 'Closed' : ready ? 'Ready To Close' : 'Open',
  }
}

export function calculateBatchLifecycle(batch, logs = [], now = new Date()) {
  const batchLogs = getLogsForBatch(logs, batch)
  const attendanceStatus = getAttendanceLifecycleStatus(batch, logs, now)
  const assessmentStatus = getAssessmentLifecycleStatus(batch, logs, now)
  const feedbackStatus = getFeedbackLifecycleStatus(batch, logs)
  const topperStatus = getTopperReportLifecycleStatus(batch, logs)
  const closeReadiness = getBatchCloseReadiness(batch, logs, now)
  const latestAssessmentUpdatedAt = latest([
    batch.assessmentScoreDeadline,
    ...(batch.assessments ?? []).map((assessment) => assessment.uploadedAt ?? assessment.createdAt),
  ])
  const feedback = batch.feedbackRuns?.[0] ?? batch.feedback ?? {}

  return {
    attendanceStatus,
    assessmentScoreDeadline: batch.assessmentScoreDeadline ?? '',
    assessmentScoreStatus: assessmentStatus,
    batchCloseReadiness: closeReadiness.status,
    canClose: closeReadiness.ready,
    consolidatedReportExported: topperStatus === 'Report Exported' || topperStatus === 'Completed',
    feedbackStatus,
    steps: [
      {
        id: 'batch_created',
        number: 1,
        title: 'Batch Created',
        status: 'Completed',
        description: 'Batch setup has been saved successfully.',
        lastUpdatedAt: batch.createdAt ?? batch.updatedAt ?? '',
      },
      {
        id: 'attendance_uploaded',
        number: 2,
        title: 'Daily Attendance Upload',
        status: attendanceStatus,
        description: 'Trainer should upload daily attendance within 15-20 minutes after training starts.',
        action: attendanceStatus === 'Missing' ? 'Send attendance reminder' : '',
        lastUpdatedAt: latest([
          ...batchLogs.filter((log) => String(log.action ?? '').includes('attendance')).map(logUpdatedAt),
          ...(batch.attendanceSessions ?? []).map((session) => session.uploadedAt),
        ]),
      },
      {
        id: 'assessment_scores_uploaded',
        number: 3,
        title: 'Assessment Upload',
        status: assessmentStatus,
        description: 'Coordinator can set a trainer deadline for assessment score upload.',
        action: 'Set score deadline',
        lastUpdatedAt: latestAssessmentUpdatedAt,
      },
      {
        id: 'feedback_triggered',
        number: 4,
        title: 'Feedback Triggered / Summary Available',
        status: feedbackStatus,
        description: 'Feedback should be triggered after training completion or completion-ready batch status.',
        lastUpdatedAt: feedback.uploadedAt ?? feedback.triggeredAt ?? '',
      },
      {
        id: 'topper_report',
        number: 5,
        title: 'Topper Identified and Consolidated Report Exported',
        status: topperStatus,
        description: 'Completed when topper signals exist and the consolidated report export is logged.',
        lastUpdatedAt: latest(batchLogs.filter((log) => String(log.action ?? '').includes('report')).map(logUpdatedAt)),
      },
      {
        id: 'batch_closed',
        number: 6,
        title: 'Batch Closed',
        status: closeReadiness.status,
        description: 'Readiness tracks completion; a Coordinator may manually close the batch when business requires.',
        action: closeReadiness.ready && batch.status !== 'Closed' ? 'Close batch' : '',
        lastUpdatedAt: batch.status === 'Closed' ? batch.updatedAt ?? '' : '',
      },
    ],
  }
}

export function createAttendanceReminderLog(batch, date = dateText(new Date())) {
  return {
    action: 'attendance_reminder',
    batchId: getBatchCode(batch),
    category: 'alert',
    level: 'INFO',
    message: `Attendance upload reminder sent to trainer for ${batch.trainingName} on ${date}.`,
    recipient: batch.trainer?.name ?? batch.trainerName ?? 'Trainer',
    status: 'Sent',
    type: 'Attendance',
  }
}

export function createAssessmentReminderLog(batch) {
  return {
    action: 'assessment_score_reminder',
    batchId: getBatchCode(batch),
    category: 'alert',
    level: 'INFO',
    message: `Assessment score upload reminder sent to trainer for ${batch.trainingName}.`,
    recipient: batch.trainer?.name ?? batch.trainerName ?? 'Trainer',
    status: 'Sent',
    type: 'Assessment',
  }
}
