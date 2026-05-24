import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { mapEmailLog, mapNotification } from '../mappers.js'
import { sendEmail } from '../services/emailService.js'
import {
  evaluateAttendanceRules,
  evaluateOnboardingRules,
} from '../services/notificationRulesService.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'

export const notificationsRouter = Router()

const canManageNotifications = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]

async function persistNotification(batch, payload) {
  const recipients = payload.recipients?.filter(Boolean) ?? []
  const notification = await prisma.notification.create({
    data: {
      batchId: batch?.id ?? null,
      batchCode: batch?.batchCode ?? payload.batchId ?? null,
      type: payload.type ?? 'Notification',
      event: payload.event,
      channel: payload.channel ?? 'Email',
      recipients,
      message: payload.message,
      status: payload.status ?? 'Mock Sent',
    },
  })
  const emailResult = await sendEmail({
    to: recipients,
    subject: payload.subject ?? `${payload.type ?? 'Notification'}: ${payload.event}`,
    body: payload.message,
  })
  await prisma.emailLog.create({
    data: {
      notificationId: notification.id,
      batchId: batch?.id ?? null,
      batchCode: batch?.batchCode ?? payload.batchId ?? null,
      to: emailResult.to,
      subject: emailResult.subject,
      body: emailResult.body,
      status: emailResult.status,
      provider: emailResult.provider,
    },
  })

  return notification
}

notificationsRouter.get('/notifications', async (request, response, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: request.query.batchId ? { batchCode: String(request.query.batchId) } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    response.json({ data: notifications.map(mapNotification) })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.post('/notifications', canManageNotifications, async (request, response, next) => {
  try {
    if (!request.body?.event || !request.body?.message) {
      response.status(400).json({ error: 'Notification event and message are required.' })
      return
    }

    const batch = request.body.batchId
      ? await prisma.batch.findUnique({ where: { batchCode: request.body.batchId } })
      : null
    const notification = await persistNotification(batch, request.body)

    response.status(201).json({ data: mapNotification(notification) })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.get('/notifications/email-logs', async (_request, response, next) => {
  try {
    const emailLogs = await prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
    })

    response.json({ data: emailLogs.map(mapEmailLog) })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.post(
  '/batches/:batchId/notifications/evaluate',
  canManageNotifications,
  async (request, response, next) => {
    try {
      const batch = await findAttendanceBatch(request.params.batchId)

      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const report = await buildAttendanceReport(batch, request.body?.source)
      const ruleNotifications = [
        ...evaluateAttendanceRules({
          batch,
          report,
          settings: request.body?.settings ?? {},
        }),
        ...evaluateOnboardingRules({ batch }),
      ]
      const persisted = []

      for (const notification of ruleNotifications) {
        persisted.push(await persistNotification(batch, notification))
      }

      response.status(201).json({ data: persisted.map(mapNotification) })
    } catch (error) {
      next(error)
    }
  },
)
