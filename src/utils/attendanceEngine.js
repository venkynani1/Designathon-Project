import Papa from 'papaparse'
import { getAssessmentStats } from './assessmentEngine.js'
import { filterParticipantsByDuration, parseTeamsAttendanceRows } from './teamsParser.js'
import { getWebexMeetingMetadata, parseWebexAttendanceRows } from './webexParser.js'

function parseTeamsFilename(fileName) {
  const cleanName = fileName.replace(/\.csv$/i, '')
  const match = cleanName.match(/^(.*)\s+-\s+Attendance report\s+(\d{1,2}-\d{1,2}-\d{2,4})$/i)

  if (!match) {
    return {
      trainingName: cleanName,
      date: 'Unknown date',
    }
  }

  return {
    trainingName: match[1].trim(),
    date: normalizeFilenameDate(match[2]),
  }
}

function normalizeFilenameDate(dateText) {
  const [month, day, year] = dateText.split('-')
  const fullYear = year.length === 2 ? `20${year}` : year

  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.name?.toLowerCase().endsWith('.csv')) {
      reject(new Error('Invalid attendance file. Please upload a CSV export.'))
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          reject(new Error('Unable to read the CSV file. Please check the export format.'))
          return
        }

        resolve(results.data)
      },
      error: (error) => reject(error),
    })
  })
}

function hasAnyColumn(rows, columns) {
  const firstRow = rows.find((row) => row && Object.keys(row).length)
  if (!firstRow) return false

  const normalizedColumns = columns.map((column) =>
    String(column).trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
  )

  return Object.keys(firstRow).some((key) =>
    normalizedColumns.includes(String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '')),
  )
}

function validateTeamsRows(rows) {
  if (!rows.length) {
    throw new Error('The uploaded Teams CSV is empty.')
  }

  if (
    !hasAnyColumn(rows, ['Full Name', 'Name', 'Participant', 'Display Name']) ||
    !hasAnyColumn(rows, ['Email', 'User Principal Name', 'UPN', 'Participant Email']) ||
    !hasAnyColumn(rows, ['In-Meeting Duration', 'Duration', 'Total Duration'])
  ) {
    throw new Error('Missing required Teams columns: name, email, and duration are required.')
  }
}

function validateWebexRows(rows) {
  if (!rows.length) {
    throw new Error('The uploaded Webex CSV is empty.')
  }

  if (
    !hasAnyColumn(rows, ['Display Name']) ||
    !hasAnyColumn(rows, ['Attendee Email']) ||
    !hasAnyColumn(rows, ['Attendance Duration'])
  ) {
    throw new Error('Missing required Webex columns: Display Name, Attendee Email, and Attendance Duration are required.')
  }
}

function getRosterIdentity(participant, trainingType) {
  if (trainingType === 'Internal') {
    return {
      empId: participant.empId ?? participant.EMP_ID ?? '',
      name: participant.empName ?? participant.EMP_NAME ?? participant.name ?? '',
      email: participant.officialEmail ?? participant.email ?? '',
    }
  }

  return {
    empId: participant.empId ?? '',
    name: participant.name ?? participant.empName ?? '',
    email: participant.email ?? participant.personalEmail ?? '',
  }
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getAttendeeIdentity(attendee) {
  return {
    empId: attendee.empId ?? attendee.EMPID ?? attendee.EMP_ID ?? '',
    name: attendee.name ?? attendee.NAME ?? '',
    email: attendee.email ?? attendee.EMAIL ?? '',
  }
}

function getAttendanceMatch(rosterParticipant, attendees) {
  const rosterEmpId = normalizeIdentity(rosterParticipant.empId)
  const rosterEmail = normalizeIdentity(rosterParticipant.email)
  const rosterName = normalizeIdentity(rosterParticipant.name)

  return attendees.find((attendee) => {
    const a = getAttendeeIdentity(attendee)

    return (
      (rosterEmpId && normalizeIdentity(a.empId) === rosterEmpId) ||
      (rosterEmail && normalizeIdentity(a.email) === rosterEmail) ||
      (rosterName && normalizeIdentity(a.name) === rosterName)
    )
  })
}

function getConsecutiveAbsences(dateWise) {
  let current = 0
  let max = 0

  Object.values(dateWise).forEach((status) => {
    if (status === 'A') {
      current++
      max = Math.max(max, current)
    } else {
      current = 0
    }
  })

  return max
}

function getAttendancePercent(presentCount, sessionCount) {
  if (sessionCount === 0) return null
  return Math.round((presentCount / sessionCount) * 100)
}

function getAssessmentSignal(rosterParticipant, assessments = []) {
  const results = assessments.flatMap((assessment) =>
    (assessment.results ?? []).map((result) => ({
      assessment,
      result,
    })),
  )
  const matches = results.filter(({ result }) => {
    const identity = {
      empId: result.empId,
      name: result.name,
      email: result.email,
    }

    return Boolean(getAttendanceMatch(rosterParticipant, [identity]))
  })

  if (!matches.length) {
    return assessments.length
      ? {
          score: null,
          cutoff: null,
          status: 'Pending',
        }
      : {
          score: null,
          cutoff: null,
          status: 'N/A',
        }
  }

  const weighted = matches.reduce(
    (current, { assessment, result }) => {
      const weightage = Number(assessment.weightage ?? 100)
      current.score += Number(result.scorePercent ?? 0) * weightage
      current.cutoff += Number(assessment.cutoffScore ?? 0) * weightage
      current.weightage += weightage
      return current
    },
    { score: 0, cutoff: 0, weightage: 0 },
  )
  const score = weighted.weightage ? Math.round(weighted.score / weighted.weightage) : null
  const cutoff = weighted.weightage ? Math.round(weighted.cutoff / weighted.weightage) : null

  return {
    score,
    cutoff,
    status: score === null || cutoff === null ? 'Pending' : score >= cutoff ? 'Cleared' : 'Not Cleared',
  }
}

function getRiskLevel(attendancePercent, absences, assessmentSignal) {
  if (assessmentSignal?.status === 'Not Cleared') return 'HIGH'
  if (attendancePercent === null) {
    return assessmentSignal?.status === 'Pending' ? 'MEDIUM' : 'LOW'
  }
  if (attendancePercent < 50 || absences >= 3) return 'HIGH'
  if (
    attendancePercent < 75 ||
    absences === 2 ||
    assessmentSignal?.status === 'Pending' ||
    (
      assessmentSignal?.score !== null &&
      assessmentSignal?.cutoff !== null &&
      assessmentSignal.score < assessmentSignal.cutoff + 10
    )
  ) {
    return 'MEDIUM'
  }
  return 'LOW'
}

function getRiskReason(percent, absences, assessmentSignal) {
  if (percent === null && assessmentSignal?.status === 'N/A') return 'attendance not uploaded'

  const reasons = []

  if (percent === null) reasons.push('attendance not uploaded')
  if (percent < 50) reasons.push(`attendance below 50% (${percent}%)`)
  else if (percent < 75) reasons.push(`attendance below expected (${percent}%)`)

  if (absences >= 3) reasons.push(`${absences} consecutive absences`)
  else if (absences === 2) reasons.push('2 consecutive absences')

  if (assessmentSignal?.status === 'Not Cleared') {
    reasons.push(`assessment below cutoff (${assessmentSignal.score}%/${assessmentSignal.cutoff}%)`)
  } else if (assessmentSignal?.status === 'Pending') {
    reasons.push('assessment score pending')
  }

  return reasons.length ? reasons.join(', ') : 'healthy attendance'
}

function getRecommendedAction(level) {
  if (level === 'HIGH') return 'Escalate immediately and schedule remediation'
  if (level === 'MEDIUM') return 'Send reminder, monitor, and verify assessment completion'
  return 'No action needed'
}

export function getBatchHealth(batch, attendanceSummary) {
  const totalParticipants = batch.participants?.length ?? 0
  const highRisk = attendanceSummary?.highRisk ?? batch.healthSnapshot?.highRisk ?? 0
  const mediumRisk = attendanceSummary?.mediumRisk ?? batch.healthSnapshot?.mediumRisk ?? 0
  const highRiskPercent = totalParticipants
    ? Math.round((highRisk / totalParticipants) * 100)
    : 0
  const mediumRiskPercent = totalParticipants
    ? Math.round((mediumRisk / totalParticipants) * 100)
    : 0
  const assessmentStats = getAssessmentStats(batch)
  const clearanceRate =
    assessmentStats.assessed > 0
      ? assessmentStats.clearanceRate
      : batch.healthSnapshot?.assessmentClearance ?? 100

  if (highRiskPercent > 30 || clearanceRate < 50) {
    return {
      level: 'Critical',
      tone: 'critical',
      reason:
        highRiskPercent > 30
          ? `${highRiskPercent}% of candidates are high risk.`
          : `Assessment clearance is low at ${clearanceRate}%.`,
    }
  }

  if (mediumRiskPercent > 40) {
    return {
      level: 'Moderate',
      tone: 'warning',
      reason: `${mediumRiskPercent}% of candidates need monitoring.`,
    }
  }

  return {
    level: 'Healthy',
    tone: 'healthy',
    reason: 'Attendance and assessment signals are within expected range.',
  }
}

export function getHealthBadgeClasses(tone) {
  const styles = {
    critical: 'border-red-400/30 bg-red-400/10 text-red-200',
    warning: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200',
    healthy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  }

  return styles[tone] ?? styles.healthy
}

export function getBatchLifecycle(batch, health) {
  const hasAttendance =
    batch.timeline?.['Day-wise Attendance Uploaded'] === 'completed' ||
    batch.timeline?.['Day-wise Attendance Uploaded'] === 'done' ||
    batch.healthSnapshot?.attendanceUploaded
  const hasAssessment = (batch.assessments ?? []).some((assessment) => assessment.results?.length)
  const feedbackTriggered = Boolean(batch.feedback?.triggeredAt)
  const feedbackCompleted = Boolean(batch.feedback?.responses?.length)
  const topperIdentified = hasAssessment
  const isClosed = batch.status === 'Closed'

  return [
    {
      label: 'Batch Created',
      state: 'completed',
      detail: 'Batch setup is available.',
    },
    {
      label: 'Attendance Uploaded',
      state: hasAttendance ? 'completed' : health?.tone === 'critical' ? 'critical' : 'warning',
      detail: hasAttendance ? 'Attendance records are available.' : 'Attendance upload is pending.',
    },
    {
      label: 'Assessment Completed',
      state: hasAssessment ? 'completed' : 'pending',
      detail: hasAssessment ? 'Assessment scores are mapped.' : 'Assessment scores are pending.',
    },
    {
      label: 'Feedback Triggered',
      state: feedbackCompleted ? 'completed' : feedbackTriggered ? 'warning' : 'pending',
      detail: feedbackCompleted
        ? 'Feedback responses are uploaded.'
        : feedbackTriggered
          ? 'Feedback request is awaiting responses.'
          : 'Feedback trigger is pending.',
    },
    {
      label: 'Topper Identified',
      state: topperIdentified ? 'completed' : 'pending',
      detail: topperIdentified ? 'Topper can be calculated from scores.' : 'Topper awaits assessment results.',
    },
    {
      label: 'Batch Closed',
      state: isClosed ? 'completed' : 'pending',
      detail: isClosed ? 'Batch lifecycle is closed.' : 'Batch is still in execution.',
    },
  ]
}

function getUnmatchedAttendees(batchParticipants, session, trainingType) {
  return session.participants.filter((attendee) => {
    return !batchParticipants.some((p) => {
      const r = getRosterIdentity(p, trainingType)
      return Boolean(getAttendanceMatch(r, [attendee]))
    })
  })
}

export function generateBatchSummary(summary) {
  const {
    feedbackSummary,
    highRisk,
    mediumRisk,
    notCleared = 0,
    pendingAssessment = 0,
    totalParticipants = 0,
    unmatched,
  } = summary
  const highRiskText = totalParticipants
    ? `${highRisk} of ${totalParticipants} participants`
    : `${highRisk} participants`

  let msg = ''

  if (highRisk > 0)
    msg += `${highRiskText} are at high risk due to low attendance, absence patterns, or assessment cutoff misses. `
  if (mediumRisk > 0)
    msg += `${mediumRisk} participants need monitoring. `
  if (notCleared > 0)
    msg += `${notCleared} participants have not cleared assessment cutoff. `
  if (pendingAssessment > 0)
    msg += `${pendingAssessment} assessment scores are pending. `
  if (unmatched > 0)
    msg += `${unmatched} unmatched records require coordinator review. `
  if (feedbackSummary)
    msg += `Feedback signal: ${feedbackSummary}`

  return msg.trim() || 'All participants have healthy attendance and assessment signals.'
}

export async function processTeamsAttendanceFiles(files, minDuration = 0) {
  const fileList = Array.from(files ?? [])

  if (!fileList.length) {
    throw new Error('Please select at least one Teams attendance CSV file.')
  }

  const trainingParticipant = await Promise.all(
    fileList.map(async (file) => {
      const { trainingName, date } = parseTeamsFilename(file.name)
      const rows = await parseCsvFile(file)
      validateTeamsRows(rows)

      const participants = filterParticipantsByDuration(
        parseTeamsAttendanceRows(rows, trainingName),
        minDuration,
      )

      return { date, participants }
    }),
  )

  return {
    source: 'Teams',
    trainingName: fileList[0]
      ? parseTeamsFilename(fileList[0].name).trainingName
      : '',
    trainingParticipant: trainingParticipant.sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    dateCount: trainingParticipant.length,
  }
}

export async function processWebexAttendanceFiles(files, minDuration = 0) {
  const fileList = Array.from(files ?? [])

  if (!fileList.length) {
    throw new Error('Please select at least one Webex attendance CSV file.')
  }

  const processedFiles = await Promise.all(
    fileList.map(async (file) => {
      const rows = await parseCsvFile(file)
      validateWebexRows(rows)
      const { trainingName, date } = getWebexMeetingMetadata(rows, file.name)
      const participants = filterParticipantsByDuration(
        parseWebexAttendanceRows(rows),
        minDuration,
      )

      return { date, participants, trainingName }
    }),
  )

  return {
    source: 'Webex',
    trainingName: processedFiles[0]?.trainingName ?? '',
    trainingParticipant: processedFiles
      .map(({ date, participants }) => ({ date, participants }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dateCount: processedFiles.length,
  }
}

export function prepareAttendanceReport(
  batchParticipants,
  trainingDetails,
  trainingType,
  assessments = [],
  feedbackSummary = '',
) {
  const sessions = trainingDetails?.trainingParticipant ?? []
  const dates = sessions.map((s) => s.date)
  const source = trainingDetails?.source ?? 'Teams'

  const rows = batchParticipants.map((p) => {
    const r = getRosterIdentity(p, trainingType)
    const dateWise = {}
    const durationByDate = {}

    let presentCount = 0

    sessions.forEach((s) => {
      const match = getAttendanceMatch(r, s.participants)
      const isPresent = Boolean(match)

      dateWise[s.date] = isPresent ? 'P' : 'A'
      durationByDate[s.date] = match?.durationMinutes ?? 0

      if (isPresent) presentCount++
    })

    const sessionCount = dates.length
    const percent = getAttendancePercent(presentCount, sessionCount)
    const absences = getConsecutiveAbsences(dateWise)
    const assessmentSignal = getAssessmentSignal(r, assessments)
    const level = getRiskLevel(percent, absences, assessmentSignal)

    return {
      empId: r.empId,
      name: r.name,
      email: r.email,
      dateWise,
      durationByDate,
      totalDuration: Object.values(durationByDate).reduce((a, b) => a + b, 0),
      SESSIONCOUNT: sessionCount,
      PRESENTCOUNT: presentCount,
      attendancePercent: percent,
      assessmentScore: assessmentSignal.score,
      assessmentCutoff: assessmentSignal.cutoff,
      assessmentStatus: assessmentSignal.status,
      consecutiveAbsences: absences,
      riskLevel: level,
      riskReason: getRiskReason(percent, absences, assessmentSignal),
      recommendedAction: getRecommendedAction(level),
    }
  })

  const unmatchedRecords = sessions.flatMap((s) =>
    getUnmatchedAttendees(batchParticipants, s, trainingType).map((a) => {
      const ai = getAttendeeIdentity(a)
      return {
        date: s.date,
        source,
        name: ai.name,
        email: ai.email,
        empId: ai.empId,
        durationMinutes: a.durationMinutes ?? 0,
        reason: 'Not matched with batch participants',
      }
    }),
  )

  const summary = {
    totalParticipants: batchParticipants.length,
    attended: rows.filter((r) => r.PRESENTCOUNT > 0).length,
    notAttended: rows.filter((r) => r.PRESENTCOUNT === 0).length,
    highRisk: rows.filter((r) => r.riskLevel === 'HIGH').length,
    mediumRisk: rows.filter((r) => r.riskLevel === 'MEDIUM').length,
    lowRisk: rows.filter((r) => r.riskLevel === 'LOW').length,
    notCleared: rows.filter((r) => r.assessmentStatus === 'Not Cleared').length,
    pendingAssessment: rows.filter((r) => r.assessmentStatus === 'Pending').length,
    unmatched: unmatchedRecords.length,
    feedbackSummary,
  }

  return {
    dates,
    source,
    rows,
    unmatchedRecords,
    summary,
    aiSummary: generateBatchSummary(summary),
  }
}
