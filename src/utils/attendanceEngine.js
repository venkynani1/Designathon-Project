import Papa from 'papaparse'
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
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    })
  })
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

function getRiskLevel(attendancePercent, absences) {
  if (attendancePercent === null) return 'LOW'
  if (attendancePercent < 50 || absences >= 3) return 'HIGH'
  if (attendancePercent < 75 || absences === 2) return 'MEDIUM'
  return 'LOW'
}

function getRiskReason(percent, absences) {
  if (percent === null) return 'attendance not uploaded'

  const reasons = []

  if (percent < 50) reasons.push(`attendance below 50% (${percent}%)`)
  else if (percent < 75) reasons.push(`attendance below expected (${percent}%)`)

  if (absences >= 3) reasons.push(`${absences} consecutive absences`)
  else if (absences === 2) reasons.push('2 consecutive absences')

  return reasons.length ? reasons.join(', ') : 'healthy attendance'
}

function getRecommendedAction(level) {
  if (level === 'HIGH') return 'Escalate immediately'
  if (level === 'MEDIUM') return 'Send reminder and monitor'
  return 'No action needed'
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
  const { highRisk, mediumRisk, unmatched } = summary

  let msg = ''

  if (highRisk > 0)
    msg += `${highRisk} participants are at high risk. `
  if (mediumRisk > 0)
    msg += `${mediumRisk} participants need monitoring. `
  if (unmatched > 0)
    msg += `${unmatched} unmatched records need review.`

  return msg || 'All participants have healthy attendance.'
}

export async function processTeamsAttendanceFiles(files, minDuration = 0) {
  const fileList = Array.from(files ?? [])

  const trainingParticipant = await Promise.all(
    fileList.map(async (file) => {
      const { trainingName, date } = parseTeamsFilename(file.name)
      const rows = await parseCsvFile(file)

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

  const processedFiles = await Promise.all(
    fileList.map(async (file) => {
      const rows = await parseCsvFile(file)
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

export function prepareAttendanceReport(batchParticipants, trainingDetails, trainingType) {
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
    const level = getRiskLevel(percent, absences)

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
      consecutiveAbsences: absences,
      riskLevel: level,
      riskReason: getRiskReason(percent, absences),
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
    unmatched: unmatchedRecords.length,
  }

  return {
    dates,
    source,
    rows,
    unmatchedRecords,
    summary,
    aiSummary: generateBatchSummary(summary), // 🔥 NEW
  }
}
