import { createHash } from 'node:crypto'
import { Router } from 'express'
import { coordinatorReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { buildRuleDecisionBundle, enrichDecisionWithAi } from '../services/aiDecisionService.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'

export const aiDecisionsRouter = Router()

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function inputHash(kind, baseline) {
  return createHash('sha256').update(stableJson({ kind, baseline })).digest('hex')
}

async function getDecision(request, response, next, kind) {
  try {
    const batch = await findAttendanceBatch(request.params.batchId)
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }
    const report = await buildAttendanceReport(batch)
    const baseline = buildRuleDecisionBundle(batch, report)[kind]
    const hash = inputHash(kind, baseline)
    const insightType = `ai_decision_${kind}`
    const key = { batchId: batch.id, insightType, inputHash: hash }
    const refresh = request.query.refresh === 'true'

    if (!refresh) {
      const cached = await prisma.aiInsight.findUnique({
        where: { batchId_insightType_inputHash: key },
      })
      if (cached) {
        response.json({ data: { ...JSON.parse(cached.summary), cached: true } })
        return
      }
    }

    const result = await enrichDecisionWithAi(kind, baseline)
    const record = {
      ...key,
      summary: JSON.stringify(result),
      provider: result.generatedBy === 'openai' ? 'openai' : 'deterministic',
      model: result.generatedBy === 'openai' ? (process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini') : 'rule-based-v1',
    }
    await prisma.aiInsight.upsert({
      where: { batchId_insightType_inputHash: key },
      update: {
        summary: record.summary,
        provider: record.provider,
        model: record.model,
        generatedAt: new Date(),
      },
      create: record,
    })
    response.json({ data: { ...result, cached: false } })
  } catch (error) {
    next(error)
  }
}

aiDecisionsRouter.get('/batches/:batchId/ai-summary', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'summary'))

aiDecisionsRouter.get('/batches/:batchId/ai-feedback-analysis', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'feedback'))

aiDecisionsRouter.get('/batches/:batchId/ai-topper-justification', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'topper'))

aiDecisionsRouter.get('/batches/:batchId/ai-anomalies', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'anomalies'))
