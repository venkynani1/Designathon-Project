import { createHash } from 'node:crypto'
import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'

export const insightsRouter = Router()

const allowedSources = new Set(['Teams', 'Webex'])
const defaultInsightType = 'attendance_summary'
const deterministicProvider = 'deterministic'
const deterministicModel = 'rule-based-v1'
const canGenerateInsights = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]

function sortStable(value) {
  if (Array.isArray(value)) {
    return value.map(sortStable)
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((current, key) => {
        current[key] = sortStable(value[key])
        return current
      }, {})
  }

  return value
}

function createInputHash(input) {
  return createHash('sha256')
    .update(JSON.stringify(sortStable(input)))
    .digest('hex')
}

function toInsightResponse(insight, batchCode, cached = false) {
  return {
    id: insight.id,
    batchId: batchCode,
    insightType: insight.insightType,
    inputHash: insight.inputHash,
    summary: insight.summary,
    provider: insight.provider,
    model: insight.model,
    generatedAt: insight.generatedAt.toISOString(),
    cached,
  }
}

function toInsightInput(batch, report, insightType) {
  return {
    batchId: batch.batchCode,
    insightType,
    source: report.source,
    dates: report.dates,
    summary: report.summary,
    rows: report.rows.map((row) => ({
      empId: row.empId,
      name: row.name,
      email: row.email,
      attendancePercent: row.attendancePercent,
      assessmentScore: row.assessmentScore,
      assessmentStatus: row.assessmentStatus,
      consecutiveAbsences: row.consecutiveAbsences,
      riskLevel: row.riskLevel,
    })),
    unmatchedRecords: report.unmatchedRecords.map((record) => ({
      date: record.date,
      source: record.source,
      empId: record.empId,
      name: record.name,
      email: record.email,
      reason: record.reason,
    })),
  }
}

insightsRouter.get('/batches/:batchId/insights', async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const insights = await prisma.aiInsight.findMany({
      where: { batchId: batch.id },
      orderBy: { generatedAt: 'desc' },
    })

    response.json({
      data: insights.map((insight) => toInsightResponse(insight, batch.batchCode)),
    })
  } catch (error) {
    next(error)
  }
})

insightsRouter.post(
  '/batches/:batchId/insights/generate',
  canGenerateInsights,
  async (request, response, next) => {
  try {
    const insightType = request.body?.insightType ?? defaultInsightType
    const source = request.body?.source

    if (source && !allowedSources.has(source)) {
      response.status(400).json({ error: 'Source must be Teams or Webex.' })
      return
    }

    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const report = await buildAttendanceReport(batch, source)
    const inputHash = createInputHash(toInsightInput(batch, report, insightType))
    const existingInsight = await prisma.aiInsight.findUnique({
      where: {
        batchId_insightType_inputHash: {
          batchId: batch.id,
          insightType,
          inputHash,
        },
      },
    })

    if (existingInsight) {
      response.json({ data: toInsightResponse(existingInsight, batch.batchCode, true) })
      return
    }

    const insight = await prisma.aiInsight.create({
      data: {
        batchId: batch.id,
        insightType,
        inputHash,
        summary: report.aiSummary,
        provider: deterministicProvider,
        model: deterministicModel,
      },
    })

    response.status(201).json({ data: toInsightResponse(insight, batch.batchCode) })
  } catch (error) {
    next(error)
  }
  },
)
