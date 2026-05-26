// Verifies the batchService.test client behavior and protects its user-facing contract.
import { describe, expect, it } from 'vitest'
import { normalizeAssessmentScoreUploadDelivery } from './batchService.js'

describe('batchService trainer reminder delivery', () => {
  it('displays a successful fallback-generated Azure trainer reminder as sent', () => {
    const delivery = normalizeAssessmentScoreUploadDelivery({
      sent: 0,
      failed: 1,
      skipped: 0,
      recipients: [{
        trainerName: 'Avery Shah',
        email: 'trainer@example.com',
        status: 'Sent',
        provider: 'Azure',
        generatedBy: 'fallback',
        messageId: 'azure-message-1',
      }],
    })

    expect(delivery).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
    expect(delivery.recipients[0]).toMatchObject({
      status: 'Sent',
      provider: 'Azure',
      generatedBy: 'fallback',
    })
  })

  it('normalizes mock success while preserving failed and skipped recipient totals', () => {
    const delivery = normalizeAssessmentScoreUploadDelivery({
      recipients: [
        { email: 'sent@example.com', status: 'Mock Sent' },
        { email: 'failed@example.com', status: 'Failed' },
        { email: '', status: 'Skipped' },
      ],
    })

    expect(delivery).toMatchObject({ sent: 1, failed: 1, skipped: 1 })
  })
})
