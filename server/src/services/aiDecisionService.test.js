// Verifies server-side aiDecisionService.test behavior and API/business-rule reliability.
import { describe, expect, it, vi } from 'vitest'
import {
  buildFeedbackAnalysisFromResponses,
  buildRuleDecisionBundle,
  classifyParticipantRisk,
  enrichDecisionBundleWithAi,
  enrichDecisionWithAi,
} from './aiDecisionService.js'

const baseRow = {
  participantId: 'p1',
  name: 'Asha',
  attendancePercent: 100,
  consecutiveAbsences: 0,
  assessmentScore: 90,
  assessmentCutoff: 70,
  assessmentStatus: 'Cleared',
  comments: '',
  SESSIONCOUNT: 2,
  totalDuration: 120,
}

describe('aiDecisionService', () => {
  it('classifies participant LOW, MEDIUM, and HIGH risk with transparent deterministic signals', () => {
    const low = classifyParticipantRisk(baseRow)
    const medium = classifyParticipantRisk({ ...baseRow, participantId: 'p2', attendancePercent: 60 })
    const high = classifyParticipantRisk({
      ...baseRow,
      participantId: 'p3',
      attendancePercent: 40,
      consecutiveAbsences: 3,
      assessmentScore: 50,
      comments: 'Struggling with the exercises.',
    })

    expect(low.riskLevel).toBe('LOW')
    expect(medium).toMatchObject({ riskLevel: 'MEDIUM', recommendedAction: 'Send reminder' })
    expect(high.riskLevel).toBe('HIGH')
    expect(high.signalsUsed).toContain('attendance:40%<50%')
    expect(high.signalsUsed).toContain('assessment:50%<70%')
    expect(classifyParticipantRisk({ ...baseRow, participantId: 'p2', attendancePercent: 60 })).toEqual(medium)
  })

  it('uses rule output when AI decisions are disabled', async () => {
    const baseline = {
      summary: 'Rule result',
      recommendedActions: ['Monitor'],
      signalsUsed: ['attendance:100%'],
      generatedBy: 'rules',
    }

    await expect(enrichDecisionWithAi('summary', baseline, {
      env: { AI_DECISION_ENABLED: 'false', OPENAI_API_KEY: 'configured' },
    })).resolves.toEqual(baseline)
  })

  it('produces deterministic uploaded-feedback analysis fields without OpenAI', () => {
    const analysis = buildFeedbackAnalysisFromResponses([{
      rating: 4,
      comments: 'Clear and practical examples.',
      topTakeaways: 'Practice labs',
      improvements: 'More practice',
      assignmentUsefulness: 'Useful',
      demonstrationUsefulness: 'Helpful',
      trainerSupportFeedback: 'Timely support',
      technicalDiscussionUsefulness: 'Useful',
    }])

    expect(analysis).toMatchObject({
      averageTrainerRating: 4,
      generatedBy: 'rules',
      topCommonTakeaways: ['Practice labs'],
      topImprovementAreas: ['More practice'],
    })
    expect(analysis.recommendedActions.length).toBeGreaterThan(0)
  })

  it('averages string feedback ratings, ignores invalid values, and scores quality signals', () => {
    const analysis = buildFeedbackAnalysisFromResponses([
      { rating: '5', comments: 'Practical and clear examples.', trainerSupportFeedback: 'Helpful support.' },
      { rating: '4', comments: 'Useful and engaging discussion.', demonstrationUsefulness: 'Clear demo.' },
      { rating: '2', comments: 'Too fast and unclear.', technicalDiscussionUsefulness: 'Useful.' },
      { rating: '', comments: 'Impactful session.' },
      { rating: 'not-a-rating', comments: 'Useful.' },
    ])

    expect(analysis.averageTrainerRating).toBe(3.67)
    expect(analysis.averageContentQuality).toBeGreaterThan(0)
    expect(analysis.averageTrainerEffectiveness).toBeGreaterThan(0)
    expect(analysis.sentimentSummary).toContain('3.7/5')
  })

  it('uses OpenAI narrative output while preserving rule-derived signals', async () => {
    const baseline = {
      summary: 'Rule result',
      recommendedActions: ['Monitor'],
      signalsUsed: ['assessment:60%<70%'],
      generatedBy: 'rules',
    }
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          summary: 'Executive AI summary based on supplied rule metrics.',
          recommendedActions: ['Schedule a review'],
        }),
      }),
    })

    const result = await enrichDecisionWithAi('summary', baseline, {
      env: {
        AI_DECISION_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'gpt-4o-mini',
      },
      fetchImpl,
    })

    expect(result).toMatchObject({
      generatedBy: 'openai',
      summary: 'Executive AI summary based on supplied rule metrics.',
      signalsUsed: ['assessment:60%<70%'],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('builds identical rule bundles for identical batch evidence', () => {
    const batch = {
      batchCode: 'BATCH-001',
      trainingName: 'React Basics',
      participants: [{ id: 'p1', name: 'Asha', email: 'asha@example.com' }],
      assessments: [],
      feedbackRuns: [],
    }
    const report = {
      rows: [baseRow],
      unmatchedRecords: [],
      summary: { notCleared: 0 },
    }

    expect(buildRuleDecisionBundle(batch, report)).toEqual(buildRuleDecisionBundle(batch, report))
  })

  it('generates all insight sections with one compact OpenAI request', async () => {
    const baseline = buildRuleDecisionBundle({
      batchCode: 'BATCH-001',
      trainingName: 'React Basics',
      participants: [{ id: 'p1', name: 'Asha', email: 'asha@example.com' }],
      assessments: [],
      feedbackRuns: [],
    }, {
      rows: [baseRow],
      unmatchedRecords: [],
      summary: { notCleared: 0 },
    })
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          summary: { summary: 'AI batch summary.', recommendedActions: ['Monitor progress.'] },
          feedback: {
            sentimentSummary: 'AI feedback summary.',
            topIssues: [],
            positiveThemes: [],
            trainerEffectivenessInsights: [],
            actionItems: [],
          },
          topper: { justification: 'AI topper justification.' },
          anomalies: { narrative: 'AI anomaly narrative.' },
        }),
      }),
    })

    const result = await enrichDecisionBundleWithAi(baseline, {
      env: {
        AI_DECISION_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        AI_DECISION_MAX_TOKENS: '800',
      },
      fetchImpl,
    })

    expect(result).toMatchObject({
      generatedBy: 'openai',
      summary: { generatedBy: 'openai', summary: 'AI batch summary.' },
      topper: { justification: 'AI topper justification.' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(requestBody.max_output_tokens).toBe(800)
  })

  it('returns rule output with a rate-limit marker when combined OpenAI generation receives 429', async () => {
    const baseline = {
      summary: { generatedBy: 'rules', recommendedActions: [], signalsUsed: [] },
      feedback: { generatedBy: 'rules' },
      topper: { generatedBy: 'rules' },
      anomalies: { generatedBy: 'rules', anomalies: [] },
    }

    const result = await enrichDecisionBundleWithAi(baseline, {
      env: {
        AI_DECISION_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      },
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 429 }),
      logger: { warn: vi.fn() },
    })

    expect(result).toMatchObject({
      generatedBy: 'rules',
      aiFallbackReason: 'rate_limited',
    })
  })
})
