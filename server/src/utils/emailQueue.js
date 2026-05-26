// Provides reusable server-side emailQueue workflow utilities.
const DEFAULT_QUEUE_DELAY_MS = 1200

let queueTail = Promise.resolve()
let nextAvailableAt = 0

function configuredDelayMs() {
  const configured = Number(process.env.AZURE_EMAIL_QUEUE_DELAY_MS)
  if (Number.isFinite(configured) && configured >= 0) return configured
  return process.env.NODE_ENV === 'test' ? 0 : DEFAULT_QUEUE_DELAY_MS
}

function wait(milliseconds) {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve()
}

export function enqueueEmailDelivery(deliver) {
  const queuedAt = Date.now()
  const queueDelayMs = configuredDelayMs()
  const queuedDelivery = queueTail
    .catch(() => undefined)
    .then(async () => {
      await wait(Math.max(0, nextAvailableAt - Date.now()))
      const startedAt = Date.now()
      try {
        return await deliver({
          queueWaitTimeMs: Math.max(0, startedAt - queuedAt),
        })
      } finally {
        nextAvailableAt = Date.now() + queueDelayMs
      }
    })

  queueTail = queuedDelivery.then(() => undefined, () => undefined)
  return queuedDelivery
}

export function resetEmailQueueForTests() {
  queueTail = Promise.resolve()
  nextAvailableAt = 0
}
