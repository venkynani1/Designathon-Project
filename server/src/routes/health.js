// Exposes authenticated HTTP endpoints for the health domain.
import { Router } from 'express'
import { config } from '../config.js'
import { prisma } from '../db.js'

export const healthRouter = Router()

async function getDatabaseStatus() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'connected'
  } catch (error) {
    console.warn('Health check database probe failed.', error)
    return 'disconnected'
  }
}

healthRouter.get('/health', async (_request, response) => {
  const db = await getDatabaseStatus()

  response.json({
    ok: db === 'connected',
    service: 'mavericks-execution-platform-api',
    db,
    emailProvider: config.emailProvider,
    schedulerConfigured: config.schedulerConfigured,
    timestamp: new Date().toISOString(),
  })
})
