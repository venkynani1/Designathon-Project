// Verifies the exportFileNames.test client behavior and protects its user-facing contract.
// Verifies that populated report downloads use readable names without changing template naming rules.
import { describe, expect, it } from 'vitest'
import { buildValueReportFileName } from './exportFileNames.js'

describe('buildValueReportFileName', () => {
  it('uses the training name, report type, and month/year', () => {
    expect(buildValueReportFileName(
      { trainingName: 'AI Training' },
      'Feedback Report',
      new Date('2026-05-27T00:00:00.000Z'),
    )).toBe('AI Training - Feedback Report - May 2026.xlsx')
  })

  it('removes filename control characters from operational names', () => {
    expect(buildValueReportFileName(
      { trainingName: 'AI / Cloud: Cohort' },
      'Teams Attendance Report',
      new Date('2026-06-01T00:00:00.000Z'),
    )).toBe('AI Cloud Cohort - Teams Attendance Report - June 2026.xlsx')
  })
})
