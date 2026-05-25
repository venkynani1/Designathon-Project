import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { requireAuth, requireRole } from '../auth.js'
import { staffReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapLog } from '../mappers.js'

export const logsRouter = Router()

const canWriteLogs = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]

function getLogData(body, batch) {
  return {
    id: body.id ?? randomUUID(),
    batchId: batch?.id ?? null,
    batchCode: body.batchId ?? null,
    action: body.action,
    category: body.category ?? 'audit',
    channel: body.channel ?? null,
    event: body.event ?? body.action,
    level: body.level ?? 'INFO',
    message: body.message,
    recipient: body.recipient ?? 'Coordinator',
    recipients: body.recipients ?? null,
    status: body.status ?? 'Open',
    type: body.type ?? 'Audit',
    createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
  }
}

function validateLogInput(body) {
  if (!body?.action || !body?.batchId || !body?.message) {
    return 'Action, batchId, and message are required.'
  }

  return null
}

logsRouter.get('/logs', staffReadAccess, async (_request, response, next) => {
  try {
    const logs = await prisma.log.findMany({
      orderBy: { createdAt: 'desc' },
    })

    response.json({ data: logs.map(mapLog) })
  } catch (error) {
    next(error)
  }
})

logsRouter.post('/logs', canWriteLogs, async (request, response, next) => {
  try {
    const validationError = validateLogInput(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.body.batchId },
    })

    const log = await prisma.log.create({
      data: getLogData(request.body, batch),
    })

    response.status(201).json({ data: mapLog(log) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Log ID already exists.' })
      return
    }

    next(error)
  }
})

logsRouter.patch('/logs/:logId/status', canWriteLogs, async (request, response, next) => {
  try {
    if (!request.body?.status) {
      response.status(400).json({ error: 'Status is required.' })
      return
    }

    const log = await prisma.log.update({
      where: { id: request.params.logId },
      data: { status: request.body.status },
    })

    response.json({ data: mapLog(log) })
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Log not found.' })
      return
    }

    next(error)
  }
})

logsRouter.get('/batches/:batchId/logs', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const logs = await prisma.log.findMany({
      where: { batchCode: request.params.batchId },
      orderBy: { createdAt: 'desc' },
    })

    response.json({ data: logs.map(mapLog) })
  } catch (error) {
    next(error)
  }
})
