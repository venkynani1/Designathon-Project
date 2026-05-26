const negativeKeywords = [
  'confused',
  'difficult',
  'poor',
  'struggling',
  'not clear',
  'unable',
  'issue',
  'disengaged',
  'unhelpful',
]

const positiveKeywords = [
  'clear',
  'excellent',
  'good',
  'helpful',
  'practical',
  'engaging',
  'valuable',
]

const improvementKeywords = [
  'pace',
  'slow',
  'fast',
  'examples',
  'practice',
  'duration',
  'doubt',
  'material',
]

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'recommendedActions'],
  properties: {
    summary: { type: 'string' },
    recommendedActions: { type: 'array', items: { type: 'string' } },
  },
}

const feedbackSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sentimentSummary', 'topIssues', 'positiveThemes', 'trainerEffectivenessInsights', 'actionItems'],
  properties: {
    sentimentSummary: { type: 'string' },
    topIssues: { type: 'array', items: { type: 'string' } },
    positiveThemes: { type: 'array', items: { type: 'string' } },
    trainerEffectivenessInsights: { type: 'array', items: { type: 'string' } },
    actionItems: { type: 'array', items: { type: 'string' } },
  },
}

const topperSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['justification'],
  properties: {
    justification: { type: 'string' },
  },
}

const anomalySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['narrative'],
  properties: {
    narrative: { type: 'string' },
  },
}

const bundleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'feedback', 'topper', 'anomalies'],
  properties: {
    summary: summarySchema,
    feedback: feedbackSchema,
    topper: topperSchema,
    anomalies: anomalySchema,
  },
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function includesKeyword(text, keywords) {
  const normalized = String(text ?? '').toLowerCase()
  return keywords.filter((keyword) => normalized.includes(keyword))
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

function addSignal(result, score, reason, signal) {
  result.riskScore += score
  result.reasons.push(reason)
  result.signalsUsed.push(signal)
}

export function classifyParticipantRisk(row = {}, participantAnomalies = []) {
  const result = {
    participantId: row.participantId ?? '',
    name: row.name ?? '',
    riskScore: 0,
    reasons: [],
    signalsUsed: [],
  }
  const attendance = row.attendancePercent
  const absences = Number(row.consecutiveAbsences ?? 0)
  const score = row.assessmentScore
  const cutoff = row.assessmentCutoff

  if (attendance !== null && attendance !== undefined && attendance < 50) {
    addSignal(result, 40, `Attendance is below 50% (${attendance}%).`, `attendance:${attendance}%<50%`)
  } else if (attendance !== null && attendance !== undefined && attendance < 75) {
    addSignal(result, 20, `Attendance is below 75% (${attendance}%).`, `attendance:${attendance}%<75%`)
  } else if (attendance === null || attendance === undefined) {
    addSignal(result, 10, 'Attendance has not been uploaded.', 'attendance:missing')
  }

  if (absences >= 3) {
    addSignal(result, 35, `${absences} consecutive absences were identified.`, `consecutive_absences:${absences}`)
  } else if (absences >= 2) {
    addSignal(result, 15, `${absences} consecutive absences require monitoring.`, `repeated_absences:${absences}`)
  }

  if (score !== null && score !== undefined && cutoff !== null && cutoff !== undefined && score < cutoff) {
    addSignal(result, 35, `Assessment score ${score}% is below the ${cutoff}% cutoff.`, `assessment:${score}%<${cutoff}%`)
  } else if (row.assessmentStatus === 'Pending') {
    addSignal(result, 10, 'Assessment score is pending.', 'assessment:pending')
  }

  const commentSignals = includesKeyword(row.comments, negativeKeywords)
  if (commentSignals.length) {
    addSignal(result, 15, 'Assessment comments include a negative learning signal.', `comments:${commentSignals.join(',')}`)
  }

  const sessions = Number(row.SESSIONCOUNT ?? 0)
  const averageDuration = sessions ? Number(row.totalDuration ?? 0) / sessions : null
  if (averageDuration !== null && averageDuration < 30) {
    addSignal(result, 15, `Average recorded duration is low (${Math.round(averageDuration)} minutes).`, 'duration:low')
  }

  participantAnomalies.forEach((anomaly) => {
    const penalty = anomaly.severity === 'HIGH' ? 25 : 15
    addSignal(result, penalty, anomaly.message, `anomaly:${anomaly.type}`)
  })

  result.riskScore = Math.min(result.riskScore, 100)
  result.riskLevel = result.riskScore >= 50 ? 'HIGH' : result.riskScore >= 20 ? 'MEDIUM' : 'LOW'
  result.recommendedAction = result.riskLevel === 'HIGH'
    ? 'Schedule 1:1 intervention and escalate to trainer/coordinator'
    : result.riskLevel === 'MEDIUM'
      ? 'Send reminder'
      : 'Monitor'
  if (!result.reasons.length) result.reasons.push('Attendance and assessment signals are within expected range.')
  result.aiNarrative = `${result.name || 'Participant'} is classified ${result.riskLevel} using ${result.signalsUsed.length || 'no adverse'} transparent risk signal${result.signalsUsed.length === 1 ? '' : 's'}.`
  return result
}

export function detectRuleAnomalies(batch = {}, report = {}) {
  const anomalies = []
  const participants = batch.participants ?? []
  const add = (type, severity, message, recommendedAction, participantIds = []) => {
    anomalies.push({ type, severity, message, recommendedAction, participantIds })
  }

  ;(report.unmatchedRecords ?? []).forEach((record) => {
    add(
      'unmatched_participant',
      'HIGH',
      `Attendance record for ${record.name || record.email || record.empId || 'an unknown participant'} is unmatched.`,
      'Resolve roster identity before relying on attendance totals.',
    )
  })

  const identities = [
    ['email', (participant) => String(participant.email ?? '').trim().toLowerCase()],
    ['employee ID', (participant) => String(participant.empId ?? '').trim().toLowerCase()],
  ]
  identities.forEach(([label, extractor]) => {
    const grouped = new Map()
    participants.forEach((participant) => {
      const identity = extractor(participant)
      if (!identity) return
      grouped.set(identity, [...(grouped.get(identity) ?? []), participant])
    })
    grouped.forEach((matches, identity) => {
      if (matches.length > 1) {
        add(
          'duplicate_identity',
          'HIGH',
          `Duplicate ${label} "${identity}" is assigned to ${matches.length} participants.`,
          'Correct the roster identity before generating decisions.',
          matches.map((participant) => participant.id),
        )
      }
    })
  })

  participants.forEach((participant) => {
    if (!participant.email) {
      add('missing_email', 'MEDIUM', `${participant.name} does not have an email address.`, 'Add an email before sending participant reminders.', [participant.id])
    }
    if (participant.placementOfficerEmail && !isEmail(participant.placementOfficerEmail)) {
      add('invalid_placement_officer_email', 'MEDIUM', `${participant.name} has an invalid placement officer email.`, 'Correct the placement officer email before escalation.', [participant.id])
    }
  })

  ;(report.rows ?? []).forEach((row) => {
    if (Number(row.consecutiveAbsences ?? 0) >= 2) {
      add('repeated_absences', row.consecutiveAbsences >= 3 ? 'HIGH' : 'MEDIUM', `${row.name} has ${row.consecutiveAbsences} consecutive absences.`, 'Review attendance and initiate follow-up.', [row.participantId])
    }
    if (Number(row.SESSIONCOUNT ?? 0) && Number(row.totalDuration ?? 0) / Number(row.SESSIONCOUNT) < 30) {
      add('low_duration', 'MEDIUM', `${row.name} has low recorded attendance duration.`, 'Confirm engagement and attendance accuracy.', [row.participantId])
    }
  })

  ;(batch.assessments ?? []).forEach((assessment) => {
    const scoreGroups = new Map()
    ;(assessment.results ?? []).forEach((result) => {
      const score = String(result.scorePercent ?? '')
      if (!score) return
      scoreGroups.set(score, [...(scoreGroups.get(score) ?? []), result])
    })
    scoreGroups.forEach((matches, score) => {
      if (matches.length >= 3) {
        add(
          'suspicious_score_duplicate',
          'MEDIUM',
          `${matches.length} participants share the exact ${score}% score in ${assessment.name}.`,
          'Review the uploaded score file for accidental duplication.',
          matches.map((result) => result.participantId),
        )
      }
    })
  })

  const highestSeverity = anomalies.some((anomaly) => anomaly.severity === 'HIGH')
    ? 'HIGH'
    : anomalies.some((anomaly) => anomaly.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW'

  return {
    anomalies,
    severity: highestSeverity,
    recommendedAction: anomalies.length
      ? 'Review identified anomalies before sending interventions or finalizing reports.'
      : 'No anomaly action required.',
    signalsUsed: anomalies.map((anomaly) => anomaly.type),
    aiNarrative: anomalies.length
      ? `${anomalies.length} deterministic anomaly signal${anomalies.length === 1 ? '' : 's'} require review.`
      : 'No deterministic anomaly signals were detected.',
    generatedBy: 'rules',
  }
}

function buildFeedbackAnalysis(batch = {}) {
  const responses = batch.feedbackRuns?.[0]?.responses ?? []
  const comments = responses
    .flatMap((response) => [response.comments, response.topTakeaways, response.improvements, response.trainerSupportFeedback])
    .filter(Boolean)
    .join(' ')
  const ratings = responses.map((response) => Number(response.rating)).filter(Number.isFinite)
  const averageRating = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null
  const issues = includesKeyword(comments, improvementKeywords.concat(negativeKeywords))
  const positives = includesKeyword(comments, positiveKeywords)

  return {
    sentimentSummary: responses.length
      ? `Received ${responses.length} response${responses.length === 1 ? '' : 's'}${averageRating === null ? '' : ` with an average rating of ${averageRating.toFixed(1)}/5`}.`
      : 'No feedback responses are available for analysis.',
    topIssues: issues.length ? issues.map((issue) => `Feedback mentions ${issue}.`) : ['No recurring negative keyword theme detected.'],
    positiveThemes: positives.length ? positives.map((theme) => `Feedback mentions ${theme}.`) : ['No recurring positive keyword theme detected.'],
    trainerEffectivenessInsights: averageRating === null
      ? ['Trainer rating data is not available.']
      : [averageRating >= 4 ? 'Trainer effectiveness signal is positive based on ratings.' : 'Trainer effectiveness should be reviewed based on ratings.'],
    actionItems: issues.length ? ['Review feedback themes with the trainer and coordinator.'] : ['Continue monitoring new feedback responses.'],
    signalsUsed: [
      `responses:${responses.length}`,
      ...(averageRating === null ? [] : [`average_rating:${averageRating.toFixed(1)}`]),
      ...issues.map((issue) => `issue_keyword:${issue}`),
      ...positives.map((theme) => `positive_keyword:${theme}`),
    ],
    generatedBy: 'rules',
  }
}

function selectTopper(batch = {}) {
  const firstAttemptByParticipant = new Map()
  ;(batch.assessments ?? []).forEach((assessment) => {
    ;(assessment.results ?? []).forEach((result) => {
      if (firstAttemptByParticipant.has(result.participantId)) return
      const score = Number(result.firstAttemptScore ?? result.scorePercent ?? 0)
      const cutoff = Number(assessment.cutoffScore ?? 0)
      const status = result.firstAttemptStatus ?? (score >= cutoff ? 'Cleared' : 'Not Cleared')
      firstAttemptByParticipant.set(result.participantId, {
        participantId: result.participantId,
        topperName: result.name,
        score: Math.round(score),
        cutoff,
        status,
      })
    })
  })
  return [...firstAttemptByParticipant.values()]
    .filter((participant) => participant.status === 'Cleared')
    .sort((left, right) => right.score - left.score)[0] ?? null
}

function buildTopperJustification(batch = {}, report = {}) {
  const topper = selectTopper(batch)
  if (!topper) {
    return {
      topperName: '',
      justification: 'No topper is available because no participant has cleared the first-attempt assessment rule.',
      signalsUsed: ['first_attempt_rule:no_eligible_participant'],
      generatedBy: 'rules',
    }
  }
  const row = (report.rows ?? []).find((participant) => participant.participantId === topper.participantId)
  const attendanceText = row?.attendancePercent === null || row?.attendancePercent === undefined
    ? ''
    : ` Attendance recorded: ${row.attendancePercent}%.`
  return {
    topperName: topper.topperName,
    justification: `${topper.topperName} is the topper based on the highest eligible first-attempt score of ${topper.score}%, meeting the ${topper.cutoff}% cutoff.${attendanceText}`,
    signalsUsed: [
      'topper_selection:existing_first_attempt_rule',
      `first_attempt_score:${topper.score}%`,
      `cutoff:${topper.cutoff}%`,
      ...(row?.attendancePercent === null || row?.attendancePercent === undefined ? [] : [`attendance:${row.attendancePercent}%`]),
    ],
    generatedBy: 'rules',
  }
}

function buildBatchSummary(batch, report, anomalies) {
  const anomalyByParticipant = new Map()
  anomalies.anomalies.forEach((anomaly) => {
    anomaly.participantIds.forEach((participantId) => {
      anomalyByParticipant.set(participantId, [...(anomalyByParticipant.get(participantId) ?? []), anomaly])
    })
  })
  const participantRisks = (report.rows ?? []).map((row) =>
    classifyParticipantRisk(row, anomalyByParticipant.get(row.participantId) ?? []),
  )
  const highRiskCount = participantRisks.filter((participant) => participant.riskLevel === 'HIGH').length
  const mediumRiskCount = participantRisks.filter((participant) => participant.riskLevel === 'MEDIUM').length
  const lowRiskCount = participantRisks.filter((participant) => participant.riskLevel === 'LOW').length
  const total = participantRisks.length || 1
  const healthScore = Math.max(0, Math.round(100 - ((highRiskCount * 45 + mediumRiskCount * 20) / total) - anomalies.anomalies.length * 3))
  const keyRisks = unique([
    ...(highRiskCount ? [`${highRiskCount} participant${highRiskCount === 1 ? '' : 's'} classified high risk.`] : []),
    ...(anomalies.anomalies.length ? [`${anomalies.anomalies.length} roster or engagement anomal${anomalies.anomalies.length === 1 ? 'y' : 'ies'} detected.`] : []),
    ...(report.summary?.notCleared ? [`${report.summary.notCleared} participant${report.summary.notCleared === 1 ? '' : 's'} below assessment cutoff.`] : []),
  ])

  return {
    batchId: batch.batchCode,
    summary: keyRisks.length
      ? `${batch.trainingName} has a health score of ${healthScore}/100. ${keyRisks.join(' ')}`
      : `${batch.trainingName} has a health score of ${healthScore}/100 with no current high-risk rule signals.`,
    healthScore,
    keyRisks,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    participantRisks,
    attendanceInsights: unique(participantRisks.flatMap((participant) => participant.reasons).slice(0, 5)),
    assessmentInsights: report.summary?.notCleared
      ? [`${report.summary.notCleared} assessment result${report.summary.notCleared === 1 ? '' : 's'} are below cutoff.`]
      : ['No below-cutoff assessment result detected.'],
    feedbackInsights: batch.feedbackRuns?.[0]?.summary ? [batch.feedbackRuns[0].summary] : ['Feedback summary is not available.'],
    recommendedActions: unique(participantRisks.filter((participant) => participant.riskLevel !== 'LOW').map((participant) => participant.recommendedAction)),
    signalsUsed: unique(participantRisks.flatMap((participant) => participant.signalsUsed).concat(anomalies.signalsUsed)),
    generatedBy: 'rules',
  }
}

export function buildRuleDecisionBundle(batch, report) {
  const anomalies = detectRuleAnomalies(batch, report)
  return {
    summary: buildBatchSummary(batch, report, anomalies),
    feedback: buildFeedbackAnalysis(batch),
    topper: buildTopperJustification(batch, report),
    anomalies,
  }
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
}

function enhancementDefinition(kind) {
  if (kind === 'summary') return { schema: summarySchema, instructions: 'Write a concise executive batch health summary and prioritized actions. Do not change counts, scores, or risk classifications.' }
  if (kind === 'feedback') return { schema: feedbackSchema, instructions: 'Summarize feedback themes professionally. Use supplied feedback facts only and do not invent responses or ratings.' }
  if (kind === 'topper') return { schema: topperSchema, instructions: 'Write a concise topper justification. Preserve the existing first-attempt selection rule and supplied score facts.' }
  return { schema: anomalySchema, instructions: 'Write a concise anomaly review note. Do not invent anomalies or remove supplied rule signals.' }
}

async function requestOpenAiEnhancement(kind, baseline, { apiKey, fetchImpl, model, timeoutMs }) {
  const { schema, instructions } = enhancementDefinition(kind)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: `${instructions} Return only JSON matching the schema.`,
        input: JSON.stringify(baseline),
        max_output_tokens: 400,
        text: {
          format: {
            type: 'json_schema',
            name: `ai_${kind}_analysis`,
            strict: true,
            schema,
          },
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error(`OpenAI request failed with status ${response.status}.`)
      error.status = response.status
      throw error
    }
    return JSON.parse(outputText(await response.json()))
  } finally {
    clearTimeout(timeout)
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function compactBundleInput(bundle) {
  return {
    summary: {
      batchId: bundle.summary.batchId,
      summary: bundle.summary.summary,
      healthScore: bundle.summary.healthScore,
      keyRisks: bundle.summary.keyRisks,
      highRiskCount: bundle.summary.highRiskCount,
      mediumRiskCount: bundle.summary.mediumRiskCount,
      lowRiskCount: bundle.summary.lowRiskCount,
      recommendedActions: bundle.summary.recommendedActions,
    },
    feedback: bundle.feedback,
    topper: bundle.topper,
    anomalies: {
      severity: bundle.anomalies.severity,
      recommendedAction: bundle.anomalies.recommendedAction,
      anomalies: bundle.anomalies.anomalies.slice(0, 15).map((anomaly) => ({
        type: anomaly.type,
        severity: anomaly.severity,
        message: anomaly.message,
      })),
    },
  }
}

async function requestOpenAiBundle(baseline, { apiKey, fetchImpl, maxTokens, model, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: 'Write concise executive refinements for the supplied rule-derived batch insights. Preserve all scores, counts, risk levels, anomalies, and the first-attempt topper rule. Return only JSON matching the schema.',
        input: JSON.stringify(compactBundleInput(baseline)),
        max_output_tokens: maxTokens,
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_decision_bundle',
            strict: true,
            schema: bundleSchema,
          },
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error(`OpenAI request failed with status ${response.status}.`)
      error.status = response.status
      throw error
    }
    return JSON.parse(outputText(await response.json()))
  } finally {
    clearTimeout(timeout)
  }
}

function ruleBundle(baseline, reason = '') {
  return {
    ...baseline,
    ...(reason ? { aiFallbackReason: reason } : {}),
    generatedBy: 'rules',
  }
}

export async function enrichDecisionBundleWithAi(
  baseline,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console,
  } = {},
) {
  const enabled = String(env.AI_DECISION_ENABLED ?? 'false').toLowerCase() === 'true'
  const provider = String(env.AI_PROVIDER ?? 'openai').toLowerCase()
  const apiKey = env.OPENAI_API_KEY?.trim()
  const model = env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const maxTokens = positiveInteger(env.AI_DECISION_MAX_TOKENS, 800)
  const timeoutMs = positiveInteger(env.AI_DECISION_TIMEOUT_MS, 8000)

  if (!enabled || provider !== 'openai' || !apiKey || typeof fetchImpl !== 'function') {
    return ruleBundle(baseline)
  }

  try {
    const enhancement = await requestOpenAiBundle(baseline, {
      apiKey,
      fetchImpl,
      maxTokens,
      model,
      timeoutMs,
    })
    return {
      summary: {
        ...baseline.summary,
        summary: enhancement.summary.summary,
        recommendedActions: unique([
          ...baseline.summary.recommendedActions,
          ...enhancement.summary.recommendedActions,
        ]),
        generatedBy: 'openai',
      },
      feedback: { ...baseline.feedback, ...enhancement.feedback, generatedBy: 'openai' },
      topper: { ...baseline.topper, justification: enhancement.topper.justification, generatedBy: 'openai' },
      anomalies: { ...baseline.anomalies, aiNarrative: enhancement.anomalies.narrative, generatedBy: 'openai' },
      generatedBy: 'openai',
    }
  } catch (error) {
    const reason = error?.status === 429 ? 'rate_limited' : 'api_failed'
    logger.warn(`AI decision fallback used: ${error instanceof Error ? error.message : 'OpenAI call failed.'}`)
    return ruleBundle(baseline, reason)
  }
}

export async function enrichDecisionWithAi(
  kind,
  baseline,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console,
    timeoutMs,
  } = {},
) {
  const enabled = String(env.AI_DECISION_ENABLED ?? 'false').toLowerCase() === 'true'
  const provider = String(env.AI_PROVIDER ?? 'openai').toLowerCase()
  const apiKey = env.OPENAI_API_KEY?.trim()
  const model = env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const effectiveTimeoutMs = positiveInteger(timeoutMs ?? env.AI_DECISION_TIMEOUT_MS, 8000)

  if (!enabled || provider !== 'openai' || !apiKey || typeof fetchImpl !== 'function') return baseline

  try {
    const enhancement = await requestOpenAiEnhancement(kind, baseline, { apiKey, fetchImpl, model, timeoutMs: effectiveTimeoutMs })
    if (kind === 'summary') {
      return { ...baseline, summary: enhancement.summary, recommendedActions: unique([...baseline.recommendedActions, ...enhancement.recommendedActions]), generatedBy: 'openai' }
    }
    if (kind === 'feedback') return { ...baseline, ...enhancement, generatedBy: 'openai' }
    if (kind === 'topper') return { ...baseline, justification: enhancement.justification, generatedBy: 'openai' }
    return { ...baseline, aiNarrative: enhancement.narrative, generatedBy: 'openai' }
  } catch (error) {
    logger.warn(`AI decision fallback used: ${error instanceof Error ? error.message : 'OpenAI call failed.'}`)
    return baseline
  }
}
