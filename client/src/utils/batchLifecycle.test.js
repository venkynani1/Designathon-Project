// Verifies the batchLifecycle.test client behavior and protects its user-facing contract.
import { describe, expect, it } from 'vitest'
import {
  calculateBatchLifecycle,
  createAttendanceReminderLog,
  getAssessmentLifecycleStatus,
  getAttendanceLifecycleStatus,
  getBatchCloseReadiness,
} from './batchLifecycle'

const baseBatch = {
  batchId: 'BATCH-001',
  trainingName: 'React Basics',
  trainingType: 'Internal',
  startDate: '2026-05-01',
  endDate: '2026-05-01',
  timings: '10:00 AM - 12:00 PM',
  status: 'Running',
  trainer: { name: 'Avery Shah' },
  feedback: {
    triggeredAt: '2026-05-01T12:30:00.000Z',
    uploadedAt: '2026-05-01T13:00:00.000Z',
    summary: 'Average feedback rating is 4.5/5.',
    responses: [{ id: 'fb1' }],
  },
}

describe('batch lifecycle', () => {
  it('applies the attendance 15-minute upload rule', () => {
    expect(getAttendanceLifecycleStatus({
      ...baseBatch,
      attendanceSessions: [
        { sessionDate: '2026-05-01', uploadedAt: '2026-05-01T10:10:00.000Z' },
      ],
    })).toBe('Uploaded On Time')

    expect(getAttendanceLifecycleStatus({
      ...baseBatch,
      attendanceSessions: [
        { sessionDate: '2026-05-01', uploadedAt: '2026-05-01T10:20:00.000Z' },
      ],
    })).toBe('Uploaded Late')
  })

  it('marks missing attendance after the upload window', () => {
    expect(getAttendanceLifecycleStatus(
      baseBatch,
      [],
      new Date('2026-05-01T10:16:00.000Z'),
    )).toBe('Missing')
  })

  it('calculates assessment deadline status', () => {
    expect(getAssessmentLifecycleStatus({
      ...baseBatch,
      assessmentScoreDeadline: '2026-05-02T10:00:00.000Z',
      assessments: [{ id: 'asm1', results: [] }],
    }, [], new Date('2026-05-02T10:01:00.000Z'))).toBe('Overdue')

    expect(getAssessmentLifecycleStatus({
      ...baseBatch,
      assessmentScoreDeadline: '2026-05-02T10:00:00.000Z',
      assessments: [
        {
          id: 'asm1',
          uploadedAt: '2026-05-02T09:30:00.000Z',
          results: [{ participantId: 'p1', scorePercent: 90 }],
        },
      ],
    })).toBe('Uploaded Before Deadline')
  })

  it('calculates close readiness from all six lifecycle steps', () => {
    const readyBatch = {
      ...baseBatch,
      assessmentScoreDeadline: '2026-05-02T10:00:00.000Z',
      attendanceSessions: [
        { sessionDate: '2026-05-01', uploadedAt: '2026-05-01T10:10:00.000Z' },
      ],
      assessments: [
        {
          id: 'asm1',
          uploadedAt: '2026-05-02T09:30:00.000Z',
          results: [{ participantId: 'p1', scorePercent: 90, cleared: true }],
        },
      ],
    }
    const logs = [
      {
        action: 'consolidated_report_export',
        batchId: 'BATCH-001',
        createdAt: '2026-05-02T11:00:00.000Z',
      },
    ]

    expect(getBatchCloseReadiness(readyBatch, logs)).toMatchObject({
      ready: true,
      status: 'Ready To Close',
    })
    expect(calculateBatchLifecycle(readyBatch, logs).steps).toHaveLength(6)
  })

  it('creates attendance reminder log text', () => {
    expect(createAttendanceReminderLog(baseBatch, '2026-05-01')).toMatchObject({
      action: 'attendance_reminder',
      message: 'Attendance upload reminder sent to trainer for React Basics on 2026-05-01.',
      type: 'Attendance',
    })
  })
})
