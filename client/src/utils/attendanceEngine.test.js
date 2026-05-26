// Verifies the attendanceEngine.test client behavior and protects its user-facing contract.
import { describe, expect, it } from 'vitest'
import {
  generateBatchSummary,
  getBatchHealth,
  prepareAttendanceReport,
} from './attendanceEngine.js'

const participants = [
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
]

describe('attendanceEngine', () => {
  it('prepares report rows, risk summary, and unmatched records', () => {
    const report = prepareAttendanceReport(
      participants,
      {
        source: 'Teams',
        trainingParticipant: [
          {
            date: '2026-05-01',
            participants: [
              {
                empId: 'EMP-001',
                name: 'Asha Rao',
                email: 'asha@example.com',
                durationMinutes: 60,
              },
              {
                empId: 'EMP-999',
                name: 'Unknown Learner',
                email: 'unknown@example.com',
                durationMinutes: 60,
              },
            ],
          },
          {
            date: '2026-05-02',
            participants: [],
          },
        ],
      },
      'Internal',
      [
        {
          cutoffScore: 70,
          weightage: 100,
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
    )

    expect(report.dates).toEqual(['2026-05-01', '2026-05-02'])
    expect(report.rows[0]).toMatchObject({
      empId: 'EMP-001',
      PRESENTCOUNT: 1,
      attendancePercent: 50,
      assessmentStatus: 'Cleared',
      riskLevel: 'MEDIUM',
    })
    expect(report.summary).toMatchObject({
      totalParticipants: 2,
      attended: 1,
      notAttended: 1,
      unmatched: 1,
    })
    expect(report.unmatchedRecords[0]).toMatchObject({
      empId: 'EMP-999',
      reason: 'Not matched with batch participants',
    })
  })

  it('summarizes batch risk signals and health', () => {
    expect(generateBatchSummary({
      totalParticipants: 2,
      highRisk: 1,
      mediumRisk: 1,
      notCleared: 1,
      pendingAssessment: 0,
      unmatched: 0,
    })).toContain('1 of 2 participants are at high risk')

    expect(getBatchHealth({
      participants,
      assessments: [],
      healthSnapshot: { highRisk: 1, mediumRisk: 0, assessmentClearance: 100 },
    }).level).toBe('Critical')
  })
})
