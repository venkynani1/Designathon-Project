import { describe, expect, it } from 'vitest'
import { deliveryPresentation, resolveDeliveryState } from './deliveryPresentation.js'

describe('deliveryPresentation', () => {
  it('maps throttling diagnostics to a friendly temporary-unavailable state', () => {
    const delivery = {
      status: 'Failed',
      providerCode: 'TooManyRequests',
      providerMessage: 'Raw Azure rejection.',
    }

    expect(resolveDeliveryState(delivery)).toBe('temporarily_unavailable')
    expect(deliveryPresentation(delivery)).toMatchObject({
      label: 'Temporarily unavailable',
      message: 'Temporarily unavailable. Please try again later.',
    })
  })

  it('renders successful fallback-generated mail as sent', () => {
    expect(deliveryPresentation({ status: 'Sent', generatedBy: 'fallback' }).label).toBe('Sent')
  })
})
