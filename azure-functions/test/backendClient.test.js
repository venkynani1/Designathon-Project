import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSchedulerUrl,
  callSchedulerEndpoint,
  normalizeApiBaseUrl,
} from '../src/backendClient.js'

test('normalizes API base URL and scheduler endpoint URL', () => {
  assert.equal(normalizeApiBaseUrl('https://api.example.com///'), 'https://api.example.com')
  assert.equal(
    buildSchedulerUrl('https://api.example.com/', '/api/notifications/run/onboarding'),
    'https://api.example.com/api/notifications/run/onboarding',
  )
})

test('calls backend scheduler endpoint with scheduler secret header', async () => {
  const previousApiBaseUrl = process.env.API_BASE_URL
  const previousSchedulerSecret = process.env.SCHEDULER_SECRET

  process.env.API_BASE_URL = 'https://api.example.com'
  process.env.SCHEDULER_SECRET = 'test-secret'

  try {
    const calls = []
    const result = await callSchedulerEndpoint('/api/notifications/run/onboarding', {
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return {
          ok: true,
          json: async () => ({
            data: {
              event: 'participant_not_onboarded',
              processed: 1,
              sent: 1,
              skipped: 0,
              failed: 0,
            },
          }),
        }
      },
      log: { info: () => {}, error: () => {} },
    })

    assert.equal(calls[0].url, 'https://api.example.com/api/notifications/run/onboarding')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.headers['x-scheduler-secret'], 'test-secret')
    assert.equal(result.sent, 1)
  } finally {
    process.env.API_BASE_URL = previousApiBaseUrl
    process.env.SCHEDULER_SECRET = previousSchedulerSecret
  }
})
