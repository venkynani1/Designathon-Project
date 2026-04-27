import Papa from 'papaparse'
import { filterParticipantsByDuration, parseTeamsAttendanceRows } from './teamsParser.js'

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
    empId: attendee.empId ?? attendee.EMPID ?? attendee.EMP_ID ?? attendee.employeeId ?? '',
    name: attendee.name ?? attendee.NAME ?? attendee.fullName ?? '',
    email: attendee.email ?? attendee.EMAIL ?? attendee.officialEmail ?? '',
  }
}

function getAttendanceMatch(rosterParticipant, attendees) {
  const rosterEmpId = normalizeIdentity(rosterParticipant.empId)
  const rosterEmail = normalizeIdentity(rosterParticipant.email)
  const rosterName = normalizeIdentity(rosterParticipant.name)

  return attendees.find((attendee) => {
    const attendeeIdentity = getAttendeeIdentity(attendee)
    const attendeeEmpId = normalizeIdentity(attendeeIdentity.empId)
    const attendeeEmail = normalizeIdentity(attendeeIdentity.email)
    const attendeeName = normalizeIdentity(attendeeIdentity.name)

    return (
      (rosterEmpId && attendeeEmpId && rosterEmpId === attendeeEmpId) ||
      (rosterEmail && attendeeEmail && rosterEmail === attendeeEmail) ||
      (rosterName && attendeeName && rosterName === attendeeName)
    )
  })
}

function getConsecutiveAbsences(dateWise) {
  let current = 0
  let max = 0

  Object.values(dateWise).forEach((status) => {
    if (status === 'A') {
      current += 1
      max = Math.max(max, current)
    } else {
      current = 0
    }
  })

  return max
}

function getRiskLevel(attendancePercent, consecutiveAbsences) {
  if (attendancePercent === null) return 'LOW'
  if (attendancePercent < 50 || consecutiveAbsences >= 3) return 'HIGH'
  if (attendancePercent < 75 || consecutiveAbsences === 2) return 'MEDIUM'
  return 'LOW'
}

function getRiskReason(attendancePercent, consecutiveAbsences) {
  const reasons = []

  if (attendancePercent === null) {
    return 'attendance has not been uploaded yet'
  }

  if (attendancePercent < 50) {
    reasons.push(`attendance is below 50% (${attendancePercent}%)`)
  } else if (attendancePercent < 75) {
    reasons.push(`attendance is below expected threshold (${attendancePercent}%)`)
  }

  if (consecutiveAbsences >= 3) {
    reasons.push(`${consecutiveAbsences} consecutive absences`)
  } else if (consecutiveAbsences === 2) {
    reasons.push('2 consecutive absences')
  }

  return reasons.length ? reasons.join(', ') : 'attendance pattern is healthy'
}

function getRecommendedAction(riskLevel) {
  if (riskLevel === 'HIGH') {
    return 'Escalate to coordinator and trigger immediate follow-up.'
  }

  if (riskLevel === 'MEDIUM') {
    return 'Send reminder and monitor the next session closely.'
  }

  return 'No immediate action required.'
}

function getAttendancePercent(presentCount, sessionCount) {
  if (sessionCount === 0) {
    return null
  }

  return Math.round((presentCount / sessionCount) * 100)
}

function isSameIdentity(rosterParticipant, attendee) {
  return Boolean(getAttendanceMatch(rosterParticipant, [attendee]))
}

function getUnmatchedAttendees(batchParticipants, session, trainingType) {
  return session.participants.filter((attendee) => {
    return !batchParticipants.some((participant) => {
      const rosterParticipant = getRosterIdentity(participant, trainingType)
      return isSameIdentity(rosterParticipant, attendee)
    })
  })
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

      return {
        date,
        participants,
      }
    }),
  )

  const firstTrainingName = fileList[0] ? parseTeamsFilename(fileList[0].name).trainingName : ''

  return {
    trainingName: firstTrainingName,
    trainingParticipant: trainingParticipant.sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
    dateCount: trainingParticipant.length,
  }
}

export function prepareAttendanceReport(batchParticipants, trainingDetails, trainingType) {
  const sessions = trainingDetails?.trainingParticipant ?? []
  const dates = sessions.map((session) => session.date)

  const rows = batchParticipants.map((participant) => {
    const rosterParticipant = getRosterIdentity(participant, trainingType)
    const dateWise = {}
    const durationByDate = {}
    let presentCount = 0

    sessions.forEach((session) => {
      const match = getAttendanceMatch(rosterParticipant, session.participants)
      const isPresent = Boolean(match)

      dateWise[session.date] = isPresent ? 'P' : 'A'
      durationByDate[session.date] = match?.durationMinutes ?? 0

      if (isPresent) {
        presentCount += 1
      }
    })

    const sessionCount = dates.length
    const attendancePercent = getAttendancePercent(presentCount, sessionCount)
    const consecutiveAbsences = getConsecutiveAbsences(dateWise)
    const riskLevel = getRiskLevel(attendancePercent, consecutiveAbsences)

    return {
      empId: rosterParticipant.empId,
      name: rosterParticipant.name,
      email: rosterParticipant.email,
      dateWise,
      durationByDate,
      totalDuration: Object.values(durationByDate).reduce((sum, duration) => sum + duration, 0),
      SESSIONCOUNT: sessionCount,
      PRESENTCOUNT: presentCount,
      attendancePercent,
      consecutiveAbsences,
      riskLevel,
      riskReason: getRiskReason(attendancePercent, consecutiveAbsences),
      recommendedAction: getRecommendedAction(riskLevel),
    }
  })

  const unmatchedRecords = sessions.flatMap((session) =>
    getUnmatchedAttendees(batchParticipants, session, trainingType).map((attendee) => {
      const attendeeIdentity = getAttendeeIdentity(attendee)

      return {
        date: session.date,
        source: 'Teams',
        name: attendeeIdentity.name,
        email: attendeeIdentity.email,
        empId: attendeeIdentity.empId,
        durationMinutes: attendee.durationMinutes ?? 0,
        reason: 'Attendee found in Teams attendance but not matched with batch participant master.',
      }
    }),
  )

  return {
    dates,
    rows,
    unmatchedRecords,
    summary: {
      totalParticipants: batchParticipants.length,
      attended: rows.filter((row) => row.PRESENTCOUNT > 0).length,
      notAttended: rows.filter((row) => row.PRESENTCOUNT === 0).length,
      highRisk: rows.filter((row) => row.riskLevel === 'HIGH').length,
      mediumRisk: rows.filter((row) => row.riskLevel === 'MEDIUM').length,
      lowRisk: rows.filter((row) => row.riskLevel === 'LOW').length,
      unmatched: unmatchedRecords.length,
    },
  }
}
