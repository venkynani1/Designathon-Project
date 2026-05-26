import { createHash } from 'node:crypto'
import { Router } from 'express'
import { coordinatorReadAccess } from '../access.js'
import { prisma } from '../db.js'
import {
  buildRuleDecisionBundle,
  enrichDecisionBundleWithAi,
  enrichDecisionWithAi,
} from '../services/aiDecisionService.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'

export const aiDecisionsRouter = Router()
const bundleInsightType = 'ai_decision_bundle'

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

async function getDecisionInputs(batchId) {
  const batch = await findAttendanceBatch(batchId)
  if (!batch) return null
  const report = await buildAttendanceReport(batch)
  const baseline = buildRuleDecisionBundle(batch, report)
  return { batch, baseline }
}

function insightKey(batch, insightType, hash) {
  return { batchId: batch.id, insightType, inputHash: hash }
}

async function readCachedInsight(key) {
  return prisma.aiInsight.findUnique({
    where: { batchId_insightType_inputHash: key },
  })
}

async function writeInsight(key, result) {
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
}

async function getCachedBundle(inputs) {
  const hash = inputHash('bundle', inputs.baseline)
  const key = insightKey(inputs.batch, bundleInsightType, hash)
  return {
    key,
    cached: await readCachedInsight(key),
  }
}

async function getDecision(request, response, next, kind) {
  try {
    const inputs = await getDecisionInputs(request.params.batchId)
    if (!inputs) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }
    const baseline = inputs.baseline[kind]
    const hash = inputHash(kind, baseline)
    const insightType = `ai_decision_${kind}`
    const key = insightKey(inputs.batch, insightType, hash)
    const refresh = request.query.refresh === 'true'

    if (!refresh) {
      const { cached: bundle } = await getCachedBundle(inputs)
      if (bundle) {
        response.json({ data: { ...JSON.parse(bundle.summary)[kind], cached: true } })
        return
      }
      const cached = await readCachedInsight(key)
      if (cached) {
        response.json({ data: { ...JSON.parse(cached.summary), cached: true } })
        return
      }
      response.json({ data: { ...baseline, cached: false } })
      return
    }

    const result = await enrichDecisionWithAi(kind, baseline)
    await writeInsight(key, result)
    response.json({ data: { ...result, cached: false } })
  } catch (error) {
    next(error)
  }
}

aiDecisionsRouter.get('/batches/:batchId/ai-insights', coordinatorReadAccess, async (request, response, next) => {
  try {
    const inputs = await getDecisionInputs(request.params.batchId)
    if (!inputs) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }
    const { cached } = await getCachedBundle(inputs)
    const result = cached
      ? JSON.parse(cached.summary)
      : { ...inputs.baseline, generatedBy: 'rules' }
    response.json({ data: { ...result, cached: Boolean(cached) } })
  } catch (error) {
    next(error)
  }
})

aiDecisionsRouter.post('/batches/:batchId/ai-insights/generate-all', coordinatorReadAccess, async (request, response, next) => {
  try {
    const inputs = await getDecisionInputs(request.params.batchId)
    if (!inputs) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }
    const { key, cached } = await getCachedBundle(inputs)
    if (cached && request.body?.refresh !== true) {
      response.json({ data: { ...JSON.parse(cached.summary), cached: true } })
      return
    }
    const result = await enrichDecisionBundleWithAi(inputs.baseline)
    await writeInsight(key, result)
    response.status(201).json({ data: { ...result, cached: false } })
  } catch (error) {
    next(error)
  }
})

aiDecisionsRouter.get('/batches/:batchId/ai-summary', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'summary'))

aiDecisionsRouter.get('/batches/:batchId/ai-feedback-analysis', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'feedback'))

aiDecisionsRouter.get('/batches/:batchId/ai-topper-justification', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'topper'))

aiDecisionsRouter.get('/batches/:batchId/ai-anomalies', coordinatorReadAccess, (request, response, next) =>
  getDecision(request, response, next, 'anomalies'))
