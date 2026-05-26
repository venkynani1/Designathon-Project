// Verifies server-side emailQueue.test behavior and API/business-rule reliability.
import { afterEach, describe, expect, it } from 'vitest'
import { enqueueEmailDelivery, resetEmailQueueForTests } from './emailQueue.js'

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

afterEach(() => {
  delete process.env.AZURE_EMAIL_QUEUE_DELAY_MS
  resetEmailQueueForTests()
})

describe('emailQueue', () => {
  it('serializes deliveries and applies pacing between provider calls', async () => {
    process.env.AZURE_EMAIL_QUEUE_DELAY_MS = '15'
    const starts = []
    const waits = []
    let active = 0
    let maximumActive = 0

    const deliver = async ({ queueWaitTimeMs }) => {
      starts.push(Date.now())
      waits.push(queueWaitTimeMs)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await wait(5)
      active -= 1
    }

    await Promise.all([
      enqueueEmailDelivery(deliver),
      enqueueEmailDelivery(deliver),
    ])

    expect(maximumActive).toBe(1)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(15)
    expect(waits[1]).toBeGreaterThanOrEqual(15)
  })
})
