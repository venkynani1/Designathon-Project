import { describe, expect, it, vi } from 'vitest'
import { generateEmailContent } from './aiEmailService.js'

const context = {
  recipientType: 'participant',
  eventType: 'attendance_behavior_reminder',
  participantName: 'Asha Rao',
  batchName: 'React Basics',
  attendancePercentage: 62,
  recommendedAction: 'Attend upcoming sessions.',
}

describe('aiEmailService', () => {
  it('uses deterministic fallback when OPENAI_API_KEY is missing', async () => {
    const email = await generateEmailContent(context, {
      env: { AI_EMAIL_ENABLED: 'true', AI_PROVIDER: 'openai', NODE_ENV: 'test' },
    })

    expect(email).toMatchObject({
      aiGenerated: false,
      aiProvider: 'fallback',
      aiFallbackReason: 'missing_api_key',
    })
    expect(email.text).toContain('Current attendance: 62%')
  })

  it('returns structured content from a successful OpenAI response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          subject: 'Generated subject',
          html: '<p>Generated email</p>',
          text: 'Generated email',
        }),
      }),
    })

    const email = await generateEmailContent(context, {
      env: {
        AI_EMAIL_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-api-key',
        OPENAI_MODEL: 'gpt-4o-mini',
      },
      fetchImpl,
    })

    expect(email).toMatchObject({
      subject: 'Generated subject',
      aiGenerated: true,
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('falls back immediately without retrying an OpenAI rate-limit response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    })
    const logger = { warn: vi.fn() }

    const email = await generateEmailContent(context, {
      env: {
        AI_EMAIL_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-api-key',
        AI_EMAIL_MAX_ATTEMPTS: '2',
      },
      fetchImpl,
      logger,
    })

    expect(email).toMatchObject({
      aiGenerated: false,
      aiProvider: 'fallback',
      aiFallbackReason: 'rate_limited',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledOnce()
  })
})
