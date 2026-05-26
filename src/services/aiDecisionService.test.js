import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../utils/apiClient'
import { generateAiInsights, getCachedAiInsights } from './aiDecisionService'

vi.mock('../utils/apiClient', () => ({
  apiRequest: vi.fn(),
}))

describe('aiDecisionService client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses one cache-only bundle endpoint for initial AI insight display', () => {
    getCachedAiInsights('BATCH-001')

    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith('/batches/BATCH-001/ai-insights')
  })

  it('uses one explicit POST for combined AI generation', () => {
    generateAiInsights('BATCH-001', true)

    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith('/batches/BATCH-001/ai-insights/generate-all', {
      method: 'POST',
      body: JSON.stringify({ refresh: true }),
    })
  })
})
