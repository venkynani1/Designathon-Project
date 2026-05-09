import { Router } from 'express'
import { prisma } from '../db.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'
import { mapAssessment, mapBatch, mapFeedbackRun } from '../mappers.js'

export const reportsRouter = Router()

async function findReportBatch(batchId) {
  return prisma.batch.findUnique({
    where: { batchCode: batchId },
    include: {
      participants: true,
      assessments: {
        include: { results: true },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      },
      feedbackRuns: {
        include: { responses: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
  })
}

function mapReportBatch(batch) {
  return {
    ...mapBatch(batch, { includeParticipants: true }),
    assessments: (batch.assessments ?? []).map(mapAssessment),
    feedback: mapFeedbackRun(batch.feedbackRuns?.[0]),
  }
}

function calculateAssessmentStats(batch) {
  const results = (batch.assessments ?? []).flatMap((assessment) => assessment.results ?? [])
  const participantIdsWithScores = new Set(results.map((result) => result.participantId))
  const notClearedIds = new Set(
    results.filter((result) => !result.cleared).map((result) => result.participantId),
  )
  const clearedIds = new Set(
    results.filter((result) => result.cleared).map((result) => result.participantId),
  )
  const totalParticipants = batch.participants?.length ?? 0

  return {
    totalParticipants,
    assessed: participantIdsWithScores.size,
    cleared: clearedIds.size,
    notCleared: notClearedIds.size,
    remaining: Math.max(totalParticipants - participantIdsWithScores.size, 0),
    clearanceRate: totalParticipants
      ? Math.round((clearedIds.size / totalParticipants) * 100)
      : 0,
    latestAssessment: batch.assessments?.find((assessment) => assessment.results?.length)
      ? mapAssessment(batch.assessments.find((assessment) => assessment.results?.length))
      : null,
  }
}

function calculateToppers(batch) {
  const scoreByParticipant = new Map()

  ;(batch.assessments ?? []).forEach((assessment) => {
    const weightage = Number(assessment.weightage ?? 100)

    ;(assessment.results ?? []).forEach((result) => {
      const existing = scoreByParticipant.get(result.participantId) ?? {
        participantId: result.participantId,
        empId: result.empId,
        name: result.name,
        email: result.email,
        weightedScore: 0,
        totalWeightage: 0,
      }

      existing.weightedScore += Number(result.scorePercent ?? 0) * weightage
      existing.totalWeightage += weightage
      scoreByParticipant.set(result.participantId, existing)
    })
  })

  return Array.from(scoreByParticipant.values())
    .map((entry) => ({
      ...entry,
      finalScore: entry.totalWeightage
        ? Math.round(entry.weightedScore / entry.totalWeightage)
        : 0,
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
}

async function getReportPayload(batchId) {
  const batch = await findReportBatch(batchId)

  if (!batch) return null

  return {
    batch,
    mappedBatch: mapReportBatch(batch),
    assessmentStats: calculateAssessmentStats(batch),
    toppers: calculateToppers(batch),
    feedback: mapFeedbackRun(batch.feedbackRuns?.[0]),
  }
}

reportsRouter.get('/batches/:batchId/reports/assessment-data', async (request, response, next) => {
  try {
    const payload = await getReportPayload(request.params.batchId)

    if (!payload) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({ data: { batch: payload.mappedBatch } })
  } catch (error) {
    next(error)
  }
})

reportsRouter.get('/batches/:batchId/reports/topper-data', async (request, response, next) => {
  try {
    const payload = await getReportPayload(request.params.batchId)

    if (!payload) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({
      data: {
        batch: payload.mappedBatch,
        toppers: payload.toppers,
      },
    })
  } catch (error) {
    next(error)
  }
})

reportsRouter.get('/batches/:batchId/reports/consolidated-data', async (request, response, next) => {
  try {
    const payload = await getReportPayload(request.params.batchId)

    if (!payload) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const summaries = await prisma.attendanceSummary.findMany({
      where: { batchId: payload.batch.id },
      orderBy: { generatedAt: 'desc' },
    })

    response.json({
      data: {
        batch: payload.mappedBatch,
        assessmentStats: payload.assessmentStats,
        toppers: payload.toppers,
        feedback: payload.feedback,
        attendanceSummaries: summaries.map((summary) => ({
          source: summary.source,
          totalParticipants: summary.totalParticipants,
          attended: summary.attended,
          notAttended: summary.notAttended,
          highRisk: summary.highRisk,
          mediumRisk: summary.mediumRisk,
          lowRisk: summary.lowRisk,
          unmatched: summary.unmatched,
          summaryText: summary.summaryText ?? '',
          generatedAt: summary.generatedAt.toISOString(),
        })),
        logs: payload.batch.logs.map((log) => ({
          id: log.id,
          action: log.action,
          category: log.category,
          level: log.level,
          message: log.message,
          status: log.status,
          type: log.type,
          createdAt: log.createdAt.toISOString(),
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})

reportsRouter.get('/batches/:batchId/reports/attendance-data', async (request, response, next) => {
  try {
    const batch = await findAttendanceBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const report = await buildAttendanceReport(batch, request.query.source)
    response.json({
      data: {
        batch: mapBatch(batch, { includeParticipants: true }),
        ...report,
      },
    })
  } catch (error) {
    next(error)
  }
})
