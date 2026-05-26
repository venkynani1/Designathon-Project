import { describe, expect, it, vi } from 'vitest'
import { buildRuleDecisionBundle, classifyParticipantRisk, enrichDecisionWithAi } from './aiDecisionService.js'

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
})
