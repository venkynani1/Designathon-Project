// Verifies server-side participantEmail.test behavior and API/business-rule reliability.
import { describe, expect, it } from 'vitest'
import {
  hasValidEmail,
  resolveParticipantEmail,
  resolvePlacementOfficerEmail,
} from './participantEmail.js'

describe('participantEmail', () => {
  it('resolves participant emails from supported participant fields in order', () => {
    expect(resolveParticipantEmail({ email: 'primary@example.com' })).toBe('primary@example.com')
    expect(resolveParticipantEmail({ empEmail: 'employee@example.com' })).toBe('employee@example.com')
    expect(resolveParticipantEmail({ officialEmail: 'official@example.com' })).toBe('official@example.com')
    expect(resolveParticipantEmail({ participantEmail: 'participant@example.com' })).toBe('participant@example.com')
    expect(resolveParticipantEmail({
      email: 'primary@example.com',
      empEmail: 'employee@example.com',
    })).toBe('primary@example.com')
  })

  it('ignores invalid participant candidates and never resolves a placement officer email', () => {
    expect(resolveParticipantEmail({
      email: 'invalid',
      officialEmail: 'official@example.com',
      placementOfficerEmail: 'placement@example.com',
    })).toBe('official@example.com')
    expect(resolveParticipantEmail({ placementOfficerEmail: 'placement@example.com' })).toBe('')
  })

  it('resolves only a valid placement officer email for escalation', () => {
    expect(resolvePlacementOfficerEmail({
      email: 'participant@example.com',
      placementOfficerEmail: 'placement@example.com',
    })).toBe('placement@example.com')
    expect(resolvePlacementOfficerEmail({ placementOfficerEmail: 'invalid' })).toBe('')
    expect(resolvePlacementOfficerEmail({ email: 'participant@example.com' })).toBe('')
    expect(hasValidEmail('valid@example.com')).toBe(true)
    expect(hasValidEmail('not-an-email')).toBe(false)
  })
})
