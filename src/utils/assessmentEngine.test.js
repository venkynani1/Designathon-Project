import { describe, expect, it } from 'vitest'
import {
  calculateTopper,
  createAssessmentTemplateRows,
  findParticipantMatch,
  getAssessmentStats,
} from './assessmentEngine.js'

const batch = {
  trainingType: 'Internal',
  participants: [
    {
      id: 'p1',
      empId: 'EMP-001',
      empName: 'Asha Rao',
      officialEmail: 'asha@example.com',
    },
    {
      id: 'p2',
      empId: 'EMP-002',
      empName: 'Dev Menon',
      officialEmail: 'dev@example.com',
    },
  ],
  assessments: [
    {
      id: 'a1',
      cutoffScore: 70,
      weightage: 60,
      results: [
        {
          participantId: 'p1',
          empId: 'EMP-001',
          name: 'Asha Rao',
          email: 'asha@example.com',
          scorePercent: 90,
          cleared: true,
        },
        {
          participantId: 'p2',
          empId: 'EMP-002',
          name: 'Dev Menon',
          email: 'dev@example.com',
          scorePercent: 55,
          cleared: false,
        },
      ],
    },
    {
      id: 'a2',
      cutoffScore: 70,
      weightage: 40,
      results: [
        {
          participantId: 'p1',
          empId: 'EMP-001',
          name: 'Asha Rao',
          email: 'asha@example.com',
          scorePercent: 80,
          cleared: true,
        },
      ],
    },
  ],
}

describe('assessmentEngine', () => {
  it('creates templates and matches participants by identity', () => {
    expect(createAssessmentTemplateRows(batch.participants, 'Internal')[0]).toEqual([
      'EMP_ID',
      'EMP_NAME',
      'Score %',
      'Comments',
    ])
    expect(findParticipantMatch(
      batch.participants,
      { empId: '', name: '', email: 'ASHA@example.com' },
      'Internal',
    )?.id).toBe('p1')
  })

  it('calculates assessment stats and weighted toppers', () => {
    expect(getAssessmentStats(batch)).toMatchObject({
      totalParticipants: 2,
      assessed: 2,
      cleared: 1,
      notCleared: 1,
      remaining: 0,
      clearanceRate: 50,
    })

    expect(calculateTopper(batch)[0]).toMatchObject({
      participantId: 'p1',
      finalScore: 86,
    })
  })
})
