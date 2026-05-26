// Verifies the assessmentEngine.test client behavior and protects its user-facing contract.
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
      'Emp ID',
      'Emp Name',
      'Score',
      'Remarks',
    ])
    expect(createAssessmentTemplateRows(batch.participants, 'Internal')[1]).toEqual([
      'EMP-001',
      'Asha Rao',
      '',
      '',
    ])
    expect(createAssessmentTemplateRows([{ supersetId: 'SUP-1', name: 'Riya' }], 'External')[0]).toEqual([
      'Superset ID',
      'Emp Name',
      'Score',
      'Remarks',
    ])
    expect(findParticipantMatch(
      batch.participants,
      { empId: '', name: '', email: 'ASHA@example.com' },
      'Internal',
    )?.id).toBe('p1')
  })

  it('calculates assessment stats and first-attempt toppers', () => {
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
      finalScore: 90,
    })
  })

  it('keeps a first-attempt cleared participant as topper over a failed-first-attempt retake', () => {
    const retakeBatch = {
      trainingType: 'Internal',
      participants: [
        {
          id: 'neha',
          empId: 'EMP-101',
          empName: 'Neha',
          officialEmail: 'neha@example.com',
        },
        {
          id: 'nani',
          empId: 'EMP-102',
          empName: 'Nani',
          officialEmail: 'nani@example.com',
        },
      ],
      assessments: [
        {
          id: 'first',
          cutoffScore: 70,
          results: [
            {
              participantId: 'neha',
              empId: 'EMP-101',
              name: 'Neha',
              email: 'neha@example.com',
              scorePercent: 89,
              cleared: true,
            },
            {
              participantId: 'nani',
              empId: 'EMP-102',
              name: 'Nani',
              email: 'nani@example.com',
              scorePercent: 60,
              cleared: false,
            },
          ],
        },
        {
          id: 'second',
          cutoffScore: 70,
          results: [
            {
              participantId: 'nani',
              empId: 'EMP-102',
              name: 'Nani',
              email: 'nani@example.com',
              scorePercent: 90,
              firstAttemptScore: 60,
              firstAttemptStatus: 'Not Cleared',
              latestScore: 90,
              cleared: true,
            },
          ],
        },
      ],
    }

    expect(calculateTopper(retakeBatch)).toHaveLength(1)
    expect(calculateTopper(retakeBatch)[0]).toMatchObject({
      participantId: 'neha',
      finalScore: 89,
    })
  })

  it('does not let a second attempt override firstAttemptScore for topper ranking', () => {
    const improvedBatch = {
      trainingType: 'Internal',
      assessments: [
        {
          id: 'first',
          cutoffScore: 70,
          results: [
            {
              participantId: 'p1',
              empId: 'EMP-201',
              name: 'First Cleared',
              email: 'first@example.com',
              scorePercent: 88,
              cleared: true,
            },
            {
              participantId: 'p2',
              empId: 'EMP-202',
              name: 'Second Cleared',
              email: 'second@example.com',
              scorePercent: 87,
              cleared: true,
            },
          ],
        },
        {
          id: 'second',
          cutoffScore: 70,
          results: [
            {
              participantId: 'p2',
              empId: 'EMP-202',
              name: 'Second Cleared',
              email: 'second@example.com',
              scorePercent: 99,
              firstAttemptScore: 87,
              firstAttemptStatus: 'Cleared',
              latestScore: 99,
              cleared: true,
            },
          ],
        },
      ],
    }

    expect(calculateTopper(improvedBatch).map((topper) => ({
      participantId: topper.participantId,
      finalScore: topper.finalScore,
    }))).toEqual([
      { participantId: 'p1', finalScore: 88 },
      { participantId: 'p2', finalScore: 87 },
    ])
  })
})
