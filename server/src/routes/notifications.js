import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { staffReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapEmailLog, mapNotification } from '../mappers.js'
import { generateEmailContent } from '../services/aiEmailService.js'
import { sendEmail } from '../services/emailService.js'
import {
  evaluateAttendanceRules,
  evaluateOnboardingRules,
} from '../services/notificationRulesService.js'
import { buildAttendanceReport, findAttendanceBatch } from './attendance.js'

export const notificationsRouter = Router()

const canManageNotifications = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]

function requireSchedulerSecret(request, response, next) {
  const expectedSecret = process.env.SCHEDULER_SECRET
  const providedSecret = request.get('x-scheduler-secret')

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    response.status(401).json({ error: 'Invalid scheduler secret.' })
    return
  }

  next()
}

function getEmailLogProvider(provider) {
  return provider === 'azure' ? 'Azure' : 'Mock'
}

function dateText(value = new Date()) {
  return value.toISOString().slice(0, 10)
}

function parseDate(value) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getCutoffDateTime(date, cutoffTime = '10:00') {
  const [hours = 10, minutes = 0] = String(cutoffTime).split(':').map(Number)
  const cutoff = new Date(`${date}T00:00:00.000Z`)
  cutoff.setHours(hours, minutes, 0, 0)
  return cutoff
}

function getTrainingStartAlertDeadline(batch, date, fallbackCutoffTime, graceMinutes = 20) {
  const timingMatch = String(batch.timings ?? '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!timingMatch) return getCutoffDateTime(date, fallbackCutoffTime)

  let hours = Number(timingMatch[1])
  const minutes = Number(timingMatch[2] ?? 0)
  const meridiem = timingMatch[3]?.toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  const deadline = new Date(`${date}T00:00:00.000Z`)
  deadline.setHours(hours, minutes + graceMinutes, 0, 0)
  return deadline
}

function getParticipantEmail(participant) {
  return participant.email ?? participant.officialEmail ?? ''
}

function getCoordinatorRecipients(batch) {
  return [batch.coordinatorSpoc || 'Training Coordinator'].filter(Boolean)
}

function isExternalBatch(batch) {
  return batch.batchType
    ? batch.batchType === 'External/Segue'
    : batch.trainingType !== 'Internal'
}

function getTrainerName(batch) {
  return batch.trainerName ?? batch.trainer?.name ?? ''
}

function notificationContext(batch, payload) {
  return {
    recipientType: 'participant',
    eventType: payload.event,
    batchName: batch?.trainingName ?? '',
    trainerName: batch ? getTrainerName(batch) : '',
    ...(payload.context ?? {}),
  }
}

async function getAdminSettings() {
  const settings = await prisma.systemSetting.findUnique({
    where: { key: 'admin-settings' },
  })

  return settings?.value ?? {}
}

async function wasNotificationSent({ batchCode, event, eventDate, participantId = null }) {
  const existing = await prisma.notification.findFirst({
    where: {
      batchCode,
      event,
      eventDate,
      participantId,
    },
  })

  return Boolean(existing)
}

export async function persistNotification(batch, payload) {
  const recipients = payload.recipients?.filter(Boolean) ?? []
  const eventDate = payload.eventDate ?? dateText()
  const participantId = payload.participantId ?? null
  const generatedContent = payload.generateContent === false
    ? {
        subject: payload.subject ?? `${payload.type ?? 'Notification'}: ${payload.event}`,
        html: payload.html ?? `<p>${payload.message}</p>`,
        text: payload.text ?? payload.message,
        aiGenerated: false,
        aiProvider: 'provided',
      }
    : await generateEmailContent(notificationContext(batch, payload))
  const subject = generatedContent.subject
  const text = generatedContent.text
  const metadata = {
    ...(payload.metadata ?? {}),
    event: payload.event,
    eventDate,
    batchId: batch?.batchCode ?? payload.batchId ?? '',
    participantId: participantId ?? '',
    aiGenerated: Boolean(generatedContent.aiGenerated),
    aiProvider: generatedContent.aiProvider,
    ...(generatedContent.aiModel ? { aiModel: generatedContent.aiModel } : {}),
    ...(generatedContent.aiFallbackReason ? { aiFallbackReason: generatedContent.aiFallbackReason } : {}),
  }
  const notification = await prisma.notification.create({
    data: {
      batchId: batch?.id ?? null,
      batchCode: batch?.batchCode ?? payload.batchId ?? null,
      type: payload.type ?? 'Notification',
      event: payload.event,
      participantId,
      eventDate,
      channel: payload.channel ?? 'Email',
      recipients,
      message: text,
      metadata,
      status: payload.status ?? 'Pending',
    },
  })
  const emailResult = await sendEmail({
    to: recipients,
    cc: payload.cc,
    subject,
    html: generatedContent.html,
    text,
    metadata,
  })
  await prisma.emailLog.create({
    data: {
      notificationId: notification.id,
      batchId: batch?.id ?? null,
      batchCode: batch?.batchCode ?? payload.batchId ?? null,
      to: emailResult.recipients,
      cc: emailResult.cc ?? [],
      subject,
      body: text,
      event: metadata.event,
      participantId: metadata.participantId || null,
      channel: 'Email',
      status: emailResult.status,
      provider: getEmailLogProvider(emailResult.provider),
      messageId: emailResult.messageId || null,
      error: emailResult.error || null,
      metadata,
    },
  })

  return { emailResult, notification }
}

export async function persistNotificationOnce(batch, payload) {
  const alreadySent = await wasNotificationSent({
    batchCode: batch.batchCode ?? payload.batchId,
    event: payload.event,
    eventDate: payload.eventDate ?? dateText(),
    participantId: payload.participantId ?? null,
  })

  if (alreadySent) {
    return { skipped: true }
  }

  const result = await persistNotification(batch, payload)
  return {
    ...result,
    skipped: false,
  }
}

function createSummary(event) {
  return {
    event,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  }
}

function applyNotificationResult(summary, result) {
  summary.processed += 1

  if (result.skipped) {
    summary.skipped += 1
    return
  }

  if (result.emailResult?.status === 'Failed') {
    summary.failed += 1
    return
  }

  summary.sent += 1
}

async function getRunningBatches(include = {}) {
  return prisma.batch.findMany({
    where: { status: { in: ['Running', 'Active'] } },
    include,
  })
}

function hasSubmittedBeforeCutoff(batch, today, cutoffDateTime) {
  return (batch.attendanceSessions ?? []).some((session) => {
    const uploadedAt = parseDate(session.uploadedAt)
    return session.sessionDate === today && uploadedAt && uploadedAt <= cutoffDateTime
  })
}

function getSortedSessions(batch) {
  return [...(batch.attendanceSessions ?? [])].sort((left, right) =>
    String(left.sessionDate).localeCompare(String(right.sessionDate)),
  )
}

function isAbsentInSession(participant, session) {
  return !(session.records ?? []).some((record) => record.participantId === participant.id)
}

function getUpcomingAssessments(batch, today, endDate) {
  return (batch.assessments ?? []).filter((assessment) => {
    const assessmentDate = parseDate(assessment.date)
    return assessmentDate && assessmentDate >= today && assessmentDate <= endDate
  })
}

notificationsRouter.get('/notifications', staffReadAccess, async (request, response, next) => {
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
    const { notification } = await persistNotification(batch, request.body)

    response.status(201).json({ data: mapNotification(notification) })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.post('/notifications/test-email', canManageNotifications, async (request, response, next) => {
  try {
    if (!request.body?.to) {
      response.status(400).json({ error: 'Recipient email is required.' })
      return
    }

    const metadata = {
      event: 'test_email',
      batchId: request.body.batchId ?? '',
      participantId: request.body.participantId ?? '',
    }
    const emailResult = await sendEmail({
      to: request.body.to,
      subject: 'Mavericks Platform Test Email',
      html: '<p>This is a test email from Mavericks Execution Platform.</p>',
      text: 'This is a test email from Mavericks Execution Platform.',
      metadata,
    })

    await prisma.emailLog.create({
      data: {
        notificationId: null,
        batchId: null,
        batchCode: request.body.batchId ?? null,
        to: emailResult.recipients,
        cc: emailResult.cc ?? [],
        subject: 'Mavericks Platform Test Email',
        body: 'This is a test email from Mavericks Execution Platform.',
        event: metadata.event,
        participantId: metadata.participantId || null,
        channel: 'Email',
        status: emailResult.status,
        provider: getEmailLogProvider(emailResult.provider),
        messageId: emailResult.messageId || null,
        error: emailResult.error || null,
        metadata,
      },
    })

    response.status(200).json({
      data: {
        provider: emailResult.provider,
        status: emailResult.status,
        recipients: emailResult.recipients,
        messageId: emailResult.messageId,
        error: emailResult.error,
      },
    })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.get('/notifications/email-logs', staffReadAccess, async (_request, response, next) => {
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
        const result = await persistNotificationOnce(batch, notification)
        if (!result.skipped) persisted.push(result.notification)
      }

      response.status(201).json({ data: persisted.map(mapNotification) })
    } catch (error) {
      next(error)
    }
  },
)

notificationsRouter.post(
  '/notifications/run/attendance-cutoff',
  requireSchedulerSecret,
  async (_request, response, next) => {
    const event = 'attendance_not_uploaded_before_cutoff'
    const summary = createSummary(event)

    try {
      const settings = await getAdminSettings()
      const today = dateText()
      const cutoffTime = settings.attendanceDeadlineTime ?? '10:00'
      const graceMinutes = Math.min(Math.max(Number(settings.attendanceGraceMinutes ?? 20), 15), 20)
      const now = new Date()
      const batches = await getRunningBatches({
        attendanceSessions: true,
      })

      for (const batch of batches) {
        const cutoffDateTime = getTrainingStartAlertDeadline(batch, today, cutoffTime, graceMinutes)
        if (now < cutoffDateTime || hasSubmittedBeforeCutoff(batch, today, cutoffDateTime)) {
          continue
        }

        const result = await persistNotificationOnce(batch, {
          event,
          eventDate: today,
          type: 'Attendance',
          recipients: getCoordinatorRecipients(batch),
          message: `Attendance remains pending for ${batch.trainingName} on ${today}.`,
          context: {
            recipientType: 'coordinator',
            eventType: 'coordinator_attendance_pending_alert',
            batchName: batch.trainingName,
            trainerName: getTrainerName(batch),
            trainingDate: today,
            uploadDeadline: cutoffDateTime.toISOString(),
            recommendedAction: 'Please follow up with the assigned trainer and use Send Reminder if required.',
          },
        })
        applyNotificationResult(summary, result)
      }

      response.json({ data: summary })
    } catch (error) {
      next(error)
    }
  },
)

notificationsRouter.post(
  '/notifications/run/consecutive-absence',
  requireSchedulerSecret,
  async (_request, response, next) => {
    const event = 'three_consecutive_absences'
    const summary = createSummary(event)

    try {
      const today = dateText()
      const batches = await getRunningBatches({
        attendanceSessions: { include: { records: true } },
        participants: true,
      })

      for (const batch of batches) {
        const lastThreeSessions = getSortedSessions(batch).slice(-3)
        if (lastThreeSessions.length < 3) continue

        for (const participant of batch.participants ?? []) {
          const isAbsentForThree = lastThreeSessions.every((session) =>
            isAbsentInSession(participant, session),
          )

          if (!isAbsentForThree) continue

          const result = await persistNotificationOnce(batch, {
            event,
            eventDate: today,
            participantId: participant.id,
            type: 'Attendance',
            recipients: [getParticipantEmail(participant)].filter(Boolean),
            cc: [
              ...getCoordinatorRecipients(batch),
            ].filter(Boolean),
            message: `${participant.name} has been absent for 3 consecutive training days in ${batch.trainingName}.`,
            context: {
              recipientType: 'participant',
              eventType: 'attendance_behavior_reminder',
              participantName: participant.name,
              participantEmail: getParticipantEmail(participant),
              collegeName: participant.collegeName ?? '',
              batchName: batch.trainingName,
              trainerName: getTrainerName(batch),
              consecutiveAbsences: 3,
              attendanceBehavior: 'Absent for 3 consecutive training days.',
              recommendedAction: 'Please contact your coordinator immediately and resume attendance.',
            },
          })
          applyNotificationResult(summary, result)

          if (isExternalBatch(batch)) {
            if (!participant.placementOfficerEmail) {
              console.warn(`Placement officer escalation skipped for ${participant.id}: email is missing.`)
            } else {
              const escalation = await persistNotificationOnce(batch, {
                event: 'placement_officer_three_consecutive_absences_escalation',
                eventDate: today,
                participantId: participant.id,
                type: 'Escalation',
                recipients: [participant.placementOfficerEmail],
                message: `${participant.name} has been absent for 3 consecutive training days in ${batch.trainingName}.`,
                context: {
                  recipientType: 'placementOfficer',
                  eventType: 'placement_officer_escalation',
                  participantName: participant.name,
                  participantEmail: getParticipantEmail(participant),
                  placementOfficerEmail: participant.placementOfficerEmail,
                  collegeName: participant.collegeName ?? '',
                  batchName: batch.trainingName,
                  trainerName: getTrainerName(batch),
                  consecutiveAbsences: 3,
                  attendanceBehavior: 'Absent for 3 consecutive training days.',
                  recommendedAction: 'Please contact the participant and coordinate an attendance recovery plan.',
                },
              })
              applyNotificationResult(summary, escalation)
            }
          }
        }
      }

      response.json({ data: summary })
    } catch (error) {
      next(error)
    }
  },
)

notificationsRouter.post(
  '/notifications/run/onboarding',
  requireSchedulerSecret,
  async (_request, response, next) => {
    const event = 'participant_not_onboarded'
    const summary = createSummary(event)

    try {
      const today = dateText()
      const batches = await prisma.batch.findMany({
        where: { status: { in: ['Completed', 'Closed'] } },
        include: { participants: true },
      })

      for (const batch of batches) {
        for (const participant of batch.participants ?? []) {
          if (participant.isOnboarded) continue

          const result = await persistNotificationOnce(batch, {
            event,
            eventDate: today,
            participantId: participant.id,
            type: 'Onboarding',
            recipients: [getParticipantEmail(participant)].filter(Boolean),
            cc: getCoordinatorRecipients(batch),
            message: `${participant.name} is not onboarded after ${batch.trainingName} completion. Current status: ${participant.onboardingStatus ?? 'Pending'}.`,
            context: {
              recipientType: 'participant',
              eventType: 'onboarding_reminder',
              participantName: participant.name,
              participantEmail: getParticipantEmail(participant),
              collegeName: participant.collegeName ?? '',
              batchName: batch.trainingName,
              trainerName: getTrainerName(batch),
              onboardingStatus: participant.onboardingStatus ?? 'Pending',
              recommendedAction: 'Please contact your coordinator to complete onboarding.',
            },
          })
          applyNotificationResult(summary, result)

          if (isExternalBatch(batch)) {
            if (!participant.placementOfficerEmail) {
              console.warn(`Placement officer escalation skipped for ${participant.id}: email is missing.`)
            } else {
              const escalation = await persistNotificationOnce(batch, {
                event: 'placement_officer_participant_not_onboarded_escalation',
                eventDate: today,
                participantId: participant.id,
                type: 'Escalation',
                recipients: [participant.placementOfficerEmail],
                message: `${participant.name} is not onboarded after ${batch.trainingName}.`,
                context: {
                  recipientType: 'placementOfficer',
                  eventType: 'placement_officer_escalation',
                  participantName: participant.name,
                  participantEmail: getParticipantEmail(participant),
                  placementOfficerEmail: participant.placementOfficerEmail,
                  collegeName: participant.collegeName ?? '',
                  batchName: batch.trainingName,
                  trainerName: getTrainerName(batch),
                  onboardingStatus: participant.onboardingStatus ?? 'Pending',
                  recommendedAction: 'Please follow up with the participant and confirm onboarding completion.',
                },
              })
              applyNotificationResult(summary, escalation)
            }
          }
        }
      }

      response.json({ data: summary })
    } catch (error) {
      next(error)
    }
  },
)

notificationsRouter.post(
  '/notifications/run/assessment-reminders',
  requireSchedulerSecret,
  async (request, response, next) => {
    const event = 'upcoming_assessment_reminder'
    const summary = createSummary(event)

    try {
      const today = new Date(`${dateText()}T00:00:00.000Z`)
      const windowDays = Number(request.body?.windowDays ?? 7)
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + windowDays)
      const batches = await prisma.batch.findMany({
        where: { status: { in: ['Planned', 'Running', 'Active'] } },
        include: {
          assessments: true,
          participants: true,
        },
      })

      for (const batch of batches) {
        for (const assessment of getUpcomingAssessments(batch, today, endDate)) {
          const assessmentDate = dateText(parseDate(assessment.date))

          for (const participant of batch.participants ?? []) {
            const result = await persistNotificationOnce(batch, {
              event,
              eventDate: assessmentDate,
              participantId: participant.id,
              type: 'Assessment',
              recipients: [getParticipantEmail(participant)].filter(Boolean),
              cc: getCoordinatorRecipients(batch),
              message: `${assessment.name} is scheduled for ${assessmentDate} in ${batch.trainingName}.`,
              context: {
                recipientType: 'participant',
                eventType: 'assessment_reminder',
                participantName: participant.name,
                participantEmail: getParticipantEmail(participant),
                collegeName: participant.collegeName ?? '',
                batchName: batch.trainingName,
                trainerName: getTrainerName(batch),
                dueDate: assessmentDate,
                recommendedAction: 'Please prepare and complete the assessment by the scheduled date.',
              },
              metadata: {
                assessmentId: assessment.id,
                assessmentName: assessment.name,
              },
            })
            applyNotificationResult(summary, result)
          }
        }
      }

      response.json({ data: summary })
    } catch (error) {
      next(error)
    }
  },
)
