import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'

export const attendanceRouter = Router()

const allowedSources = new Set(['Teams', 'Webex', 'Manual Template', 'Manual UI'])
const canManageAttendance = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getRosterIdentity(participant, trainingType) {
  if (trainingType === 'Internal') {
    return {
      empId: participant.empId ?? '',
      name: participant.name ?? '',
      email: participant.email ?? '',
    }
  }

  return {
    empId: participant.empId ?? '',
    name: participant.name ?? '',
    email: participant.email ?? '',
  }
}

function getAttendeeIdentity(attendee) {
  return {
    empId: attendee.empId ?? attendee.EMPID ?? attendee.EMP_ID ?? '',
    name: attendee.name ?? attendee.NAME ?? '',
    email: attendee.email ?? attendee.EMAIL ?? '',
  }
}

function matchParticipant(attendee, participants, trainingType) {
  const attendeeIdentity = getAttendeeIdentity(attendee)
  const attendeeEmpId = normalize(attendeeIdentity.empId)
  const attendeeEmail = normalize(attendeeIdentity.email)
  const attendeeName = normalize(attendeeIdentity.name)

  for (const participant of participants) {
    const rosterIdentity = getRosterIdentity(participant, trainingType)

    if (attendeeEmpId && normalize(rosterIdentity.empId) === attendeeEmpId) {
      return { participant, matchMethod: 'empId' }
    }

    if (attendeeEmail && normalize(rosterIdentity.email) === attendeeEmail) {
      return { participant, matchMethod: 'email' }
    }

    if (attendeeName && normalize(rosterIdentity.name) === attendeeName) {
      return { participant, matchMethod: 'name' }
    }
  }

  return { participant: null, matchMethod: null }
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

function getAssessmentSignal(participant, assessments = []) {
  const results = assessments.flatMap((assessment) =>
    (assessment.results ?? []).map((result) => ({ assessment, result })),
  )
  const matches = results.filter(({ result }) => result.participantId === participant.id)

  if (!matches.length) {
    return assessments.length
      ? { score: null, cutoff: null, status: 'Pending' }
      : { score: null, cutoff: null, status: 'N/A' }
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
  if (attendancePercent === null) return assessmentSignal?.status === 'Pending' ? 'MEDIUM' : 'LOW'
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

function generateBatchSummary(summary) {
  const highRiskText = summary.totalParticipants
    ? `${summary.highRisk} of ${summary.totalParticipants} participants`
    : `${summary.highRisk} participants`
  let message = ''

  if (summary.highRisk > 0) {
    message += `${highRiskText} are at high risk due to low attendance, absence patterns, or assessment cutoff misses. `
  }
  if (summary.mediumRisk > 0) message += `${summary.mediumRisk} participants need monitoring. `
  if (summary.notCleared > 0) message += `${summary.notCleared} participants have not cleared assessment cutoff. `
  if (summary.pendingAssessment > 0) message += `${summary.pendingAssessment} assessment scores are pending. `
  if (summary.unmatched > 0) message += `${summary.unmatched} unmatched records require coordinator review. `
  if (summary.feedbackSummary) message += `Feedback signal: ${summary.feedbackSummary}`

  return message.trim() || 'All participants have healthy attendance and assessment signals.'
}

export async function findAttendanceBatch(batchId) {
  return prisma.batch.findUnique({
    where: { batchCode: batchId },
    include: {
      participants: true,
      assessments: { include: { results: true } },
      feedbackRuns: {
        include: { responses: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
}

export async function buildAttendanceReport(batch, source) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { batchId: batch.id, ...(source ? { source } : {}) },
    include: { records: true },
    orderBy: { sessionDate: 'asc' },
  })
  const dates = sessions.map((session) => session.sessionDate)
  const reportSource = source ?? sessions[0]?.source ?? 'Teams'
  const rows = batch.participants.map((participant) => {
    const dateWise = {}
    const durationByDate = {}
    let presentCount = 0

    sessions.forEach((session) => {
      const record = session.records.find((item) => item.participantId === participant.id)
      const isPresent = Boolean(record)

      dateWise[session.sessionDate] = isPresent ? 'P' : 'A'
      durationByDate[session.sessionDate] = record?.durationMinutes ?? 0
      if (isPresent) presentCount += 1
    })

    const sessionCount = dates.length
    const attendancePercent = sessionCount ? Math.round((presentCount / sessionCount) * 100) : null
    const consecutiveAbsences = getConsecutiveAbsences(dateWise)
    const assessmentSignal = getAssessmentSignal(participant, batch.assessments)
    const riskLevel = getRiskLevel(attendancePercent, consecutiveAbsences, assessmentSignal)

    return {
      empId: participant.empId ?? '',
      name: participant.name,
      email: participant.email ?? '',
      dateWise,
      durationByDate,
      totalDuration: Object.values(durationByDate).reduce((sum, value) => sum + value, 0),
      SESSIONCOUNT: sessionCount,
      PRESENTCOUNT: presentCount,
      attendancePercent,
      assessmentScore: assessmentSignal.score,
      assessmentCutoff: assessmentSignal.cutoff,
      assessmentStatus: assessmentSignal.status,
      consecutiveAbsences,
      riskLevel,
      riskReason: getRiskReason(attendancePercent, consecutiveAbsences, assessmentSignal),
      recommendedAction: getRecommendedAction(riskLevel),
    }
  })
  const unmatchedRecords = sessions.flatMap((session) =>
    session.records
      .filter((record) => !record.matched)
      .map((record) => ({
        date: session.sessionDate,
        source: session.source,
        name: record.sourceName ?? '',
        email: record.sourceEmail ?? '',
        empId: record.sourceEmpId ?? '',
        durationMinutes: record.durationMinutes,
        reason: record.reason ?? 'Not matched with batch participants',
      })),
  )
  const feedbackSummary = batch.feedbackRuns[0]?.summary ?? ''
  const summary = {
    totalParticipants: batch.participants.length,
    attended: rows.filter((row) => row.PRESENTCOUNT > 0).length,
    notAttended: rows.filter((row) => row.PRESENTCOUNT === 0).length,
    highRisk: rows.filter((row) => row.riskLevel === 'HIGH').length,
    mediumRisk: rows.filter((row) => row.riskLevel === 'MEDIUM').length,
    lowRisk: rows.filter((row) => row.riskLevel === 'LOW').length,
    notCleared: rows.filter((row) => row.assessmentStatus === 'Not Cleared').length,
    pendingAssessment: rows.filter((row) => row.assessmentStatus === 'Pending').length,
    unmatched: unmatchedRecords.length,
    feedbackSummary,
  }
  const aiSummary = generateBatchSummary(summary)

  if (source) {
    await prisma.attendanceSummary.upsert({
      where: { batchId_source: { batchId: batch.id, source } },
      update: {
        totalParticipants: summary.totalParticipants,
        attended: summary.attended,
        notAttended: summary.notAttended,
        highRisk: summary.highRisk,
        mediumRisk: summary.mediumRisk,
        lowRisk: summary.lowRisk,
        notCleared: summary.notCleared,
        pendingAssessment: summary.pendingAssessment,
        unmatched: summary.unmatched,
        summaryText: aiSummary,
        generatedAt: new Date(),
      },
      create: {
        batchId: batch.id,
        source,
        totalParticipants: summary.totalParticipants,
        attended: summary.attended,
        notAttended: summary.notAttended,
        highRisk: summary.highRisk,
        mediumRisk: summary.mediumRisk,
        lowRisk: summary.lowRisk,
        notCleared: summary.notCleared,
        pendingAssessment: summary.pendingAssessment,
        unmatched: summary.unmatched,
        summaryText: aiSummary,
      },
    })
  }

  return {
    dates,
    source: reportSource,
    rows,
    unmatchedRecords,
    summary,
    aiSummary,
  }
}

function validateSessionPayload(body) {
  if (!allowedSources.has(body?.source)) return 'Source must be Teams, Webex, Manual Template, or Manual UI.'
  if (!Array.isArray(body.sessions) || !body.sessions.length) return 'At least one session is required.'

  for (const session of body.sessions) {
    if (!session.date) return 'Every attendance session requires a date.'
    if (!Array.isArray(session.participants)) return 'Every session requires participants.'
  }

  return null
}

attendanceRouter.get('/batches/:batchId/attendance', async (request, response, next) => {
  try {
    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: { batchId: batch.id },
      include: { records: true },
      orderBy: { sessionDate: 'asc' },
    })

    response.json({
      data: sessions.map((session) => ({
        id: session.id,
        date: session.sessionDate,
        source: session.source,
        trainingName: session.trainingName ?? '',
        minimumDurationMinutes: session.minimumDurationMinutes,
        uploadedFileName: session.uploadedFileName ?? '',
        uploadedAt: session.uploadedAt.toISOString(),
        participants: session.records.map((record) => ({
          id: record.id,
          participantId: record.participantId ?? '',
          empId: record.sourceEmpId ?? '',
          name: record.sourceName ?? '',
          email: record.sourceEmail ?? '',
          durationMinutes: record.durationMinutes,
          matched: record.matched,
          matchMethod: record.matchMethod ?? '',
          reason: record.reason ?? '',
        })),
      })),
    })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.post(
  '/batches/:batchId/attendance/sessions',
  canManageAttendance,
  async (request, response, next) => {
  try {
    const validationError = validateSessionPayload(request.body)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    for (const session of request.body.sessions) {
      const participants = session.participants.map((attendee) => {
        const match = matchParticipant(attendee, batch.participants, batch.trainingType)
        return {
          attendee,
          participant: match.participant,
          matchMethod: match.matchMethod,
        }
      })

      await prisma.attendanceSession.upsert({
        where: {
          batchId_source_sessionDate: {
            batchId: batch.id,
            source: request.body.source,
            sessionDate: session.date,
          },
        },
        update: {
          trainingName: request.body.trainingName ?? session.trainingName ?? null,
          minimumDurationMinutes: Number(request.body.minimumDurationMinutes ?? 0),
          uploadedFileName: session.uploadedFileName ?? null,
          uploadedAt: new Date(),
          records: {
            deleteMany: {},
            create: participants.map(({ attendee, participant, matchMethod }) => ({
              participantId: participant?.id ?? null,
              sourceEmpId: attendee.empId ?? '',
              sourceName: attendee.name ?? '',
              sourceEmail: attendee.email ?? '',
              durationMinutes: Math.round(Number(attendee.durationMinutes ?? 0)),
              firstJoin: attendee.firstJoin ?? null,
              lastLeave: attendee.lastLeave ?? null,
              matched: Boolean(participant),
              matchMethod,
              reason: participant ? null : 'Not matched with batch participants',
              rawPayload: {
                ...(attendee.raw ?? attendee),
                attendanceVersion: request.body.attendanceVersion ?? null,
              },
            })),
          },
        },
        create: {
          batchId: batch.id,
          source: request.body.source,
          sessionDate: session.date,
          trainingName: request.body.trainingName ?? session.trainingName ?? null,
          minimumDurationMinutes: Number(request.body.minimumDurationMinutes ?? 0),
          uploadedFileName: session.uploadedFileName ?? null,
          records: {
            create: participants.map(({ attendee, participant, matchMethod }) => ({
              participantId: participant?.id ?? null,
              sourceEmpId: attendee.empId ?? '',
              sourceName: attendee.name ?? '',
              sourceEmail: attendee.email ?? '',
              durationMinutes: Math.round(Number(attendee.durationMinutes ?? 0)),
              firstJoin: attendee.firstJoin ?? null,
              lastLeave: attendee.lastLeave ?? null,
              matched: Boolean(participant),
              matchMethod,
              reason: participant ? null : 'Not matched with batch participants',
              rawPayload: {
                ...(attendee.raw ?? attendee),
                attendanceVersion: request.body.attendanceVersion ?? null,
              },
            })),
          },
        },
      })
    }

    const report = await buildAttendanceReport(batch, request.body.source)
    response.status(201).json({ data: report })
  } catch (error) {
    next(error)
  }
  },
)

attendanceRouter.get('/batches/:batchId/attendance/report', async (request, response, next) => {
  try {
    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({ data: await buildAttendanceReport(batch, request.query.source) })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.get('/batches/:batchId/attendance/unmatched', async (request, response, next) => {
  try {
    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const report = await buildAttendanceReport(batch, request.query.source)
    response.json({ data: report.unmatchedRecords })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.delete(
  '/batches/:batchId/attendance/sessions/:sessionId',
  canManageAttendance,
  async (request, response, next) => {
    try {
      const batch = await findAttendanceBatch(request.params.batchId)
      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const session = await prisma.attendanceSession.findFirst({
        where: {
          id: request.params.sessionId,
          batchId: batch.id,
        },
      })

      if (!session) {
        response.status(404).json({ error: 'Attendance session not found.' })
        return
      }

      await prisma.attendanceSession.delete({ where: { id: session.id } })
      await buildAttendanceReport(batch, session.source)
      response.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)
