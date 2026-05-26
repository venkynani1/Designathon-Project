// Verifies the feedbackEngine.test client behavior and protects its user-facing contract.
import { describe, expect, it } from 'vitest'
import { createFeedbackEligibleTemplateRows, generateFeedbackSummary, normalizeFeedbackRating } from './feedbackEngine.js'

describe('feedbackEngine', () => {
  it('returns an empty-state feedback summary', () => {
    expect(generateFeedbackSummary()).toBe('Feedback has not been uploaded yet.')
  })

  it('summarizes ratings, comments, and unmatched responses', () => {
    expect(generateFeedbackSummary([
      {
        rating: 4,
        comments: 'Useful',
        matched: true,
      },
      {
        rating: 5,
        comments: '',
        matched: false,
      },
    ])).toBe(
      'Average feedback rating is 4.5/5 from 2 responses. Training content quality average is 4.5/5. Trainer effectiveness average is 4.5/5. 1 responses include comments. 1 responses need roster review.',
    )
  })

  it('creates an eligible participant template prefilled with batch identities', () => {
    expect(createFeedbackEligibleTemplateRows({
      trainingType: 'Internal',
      participants: [{ empId: 'EMP-001', empName: 'Asha Rao', officialEmail: 'asha@example.com' }],
    })).toEqual([
      ['Emp ID', 'Emp Name', 'Emp Email'],
      ['EMP-001', 'Asha Rao', 'asha@example.com'],
    ])

    expect(createFeedbackEligibleTemplateRows({
      trainingType: 'Segue',
      participants: [{ supersetId: 'SUP-001', name: 'Riya Das', email: 'riya@example.com' }],
    })).toEqual([
      ['Superset ID', 'Emp Name', 'Emp Email'],
      ['SUP-001', 'Riya Das', 'riya@example.com'],
    ])
  })

  it('normalizes string ratings without converting blank or invalid values to zero', () => {
    expect(normalizeFeedbackRating('5')).toBe(5)
    expect(normalizeFeedbackRating(' 4 ')).toBe(4)
    expect(normalizeFeedbackRating('')).toBeNull()
    expect(normalizeFeedbackRating(null)).toBeNull()
    expect(normalizeFeedbackRating('invalid')).toBeNull()
  })
})
