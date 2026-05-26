import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { requireAuth, requireRole } from '../auth.js'
import { staffReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapBatch, mapParticipant } from '../mappers.js'
import {
  calculateBatchLifecycle,
  createAssessmentReminderLog,
  createAttendanceReminderLog,
} from '../utils/batchLifecycle.js'
import { persistNotification, persistSkippedEmailLog } from './notifications.js'

export const batchesRouter = Router()

const canManageBatches = [requireAuth, requireRole('Coordinator')]
const canRemindTrainer = [requireAuth, requireRole('Coordinator')]
const scheduleTypes = ['All Days', 'Custom Dates']
const trainerTypes = ['External', 'Hexavarsity']
const meetingPlatforms = ['Teams', 'Webex']
const batchTypes = ['Internal/Mavericks', 'External/Segue']

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

function getBatchData(body) {
  return {
    batchCode: body.batchId,
    trainingName: body.trainingName,
    trainingType: body.trainingType,
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    scheduleType: body.scheduleType ?? 'All Days',
    customDates: body.customDates ?? '',
    assessmentDates: body.assessmentDates ?? '',
    timings: body.timings ?? '',
    status: body.status,
    assessmentScoreDeadline: body.assessmentScoreDeadline
      ? new Date(body.assessmentScoreDeadline)
      : null,
    trainerType: body.trainerType ?? '',
    trainerName: body.trainer?.name ?? body.trainerName ?? '',
    trainerEmail: body.trainer?.email ?? body.trainerEmail ?? '',
    assignedTrainers: Array.isArray(body.assignedTrainers) ? body.assignedTrainers : [],
    trainerEmpId: body.trainerEmpId ?? '',
    trainerUnitOrCompetency:
      body.trainerUnitOrCompetency ??
      body.trainer?.specialization ??
      body.trainerSpecialization ??
      '',
    trainerPhone: body.trainer?.phone ?? body.trainerPhone ?? '',
    trainerSpecialization:
      body.trainer?.specialization ?? body.trainerSpecialization ?? '',
    meetingPlatform: body.meetingPlatform ?? '',
    batchType:
      body.batchType ??
      (body.trainingType === 'Internal' ? 'Internal/Mavericks' : 'External/Segue'),
    coordinatorSpoc: body.coordinatorSpoc ?? '',
    meetingLink: body.meetingLink ?? '',
  }
}

async function getBatchWithLifecycleData(batchId) {
  return prisma.batch.findUnique({
    where: { batchCode: batchId },
    include: {
      assessments: { include: { results: true } },
      attendanceSessions: true,
      feedbackRuns: { include: { responses: true }, orderBy: { createdAt: 'desc' } },
      logs: true,
      participants: true,
    },
  })
}

async function createReminderLog(batch, log) {
  return prisma.log.create({
    data: {
      id: `LOG-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      batchId: batch.id,
      batchCode: batch.batchCode,
      action: log.action,
      category: log.category,
      level: log.level,
      message: log.message,
      recipient: log.recipient,
      status: log.status,
      type: log.type,
      createdAt: new Date(),
    },
  })
}

function mapLifecycleBatch(batch) {
  return {
    ...mapBatch(batch, { includeParticipants: true }),
    assessments: batch.assessments ?? [],
    attendanceSessions: batch.attendanceSessions ?? [],
    feedbackRuns: batch.feedbackRuns ?? [],
  }
}

function getParticipantData(body, trainingType) {
  const isInternal = trainingType === 'Internal'
  const id =
    body.id ??
    `${isInternal ? 'EMP' : 'EXT'}-${Date.now().toString().slice(-5)}`

  return {
    id,
    participantType: isInternal ? 'Internal' : 'External',
    empId: isInternal ? body.empId ?? '' : body.empId ?? '',
    name: isInternal ? body.empName ?? body.name ?? '' : body.name ?? body.empName ?? '',
    email: isInternal
      ? body.officialEmail ?? body.email ?? ''
      : body.email ?? body.officialEmail ?? '',
    supersetId: isInternal ? null : body.supersetId ?? '',
    collegeName: body.collegeName ?? '',
    mobileNumber: isInternal ? null : body.mobileNumber ?? '',
    isOnboarded: Boolean(body.isOnboarded),
    onboardingStatus: body.onboardingStatus ?? (body.isOnboarded ? 'Onboarded' : 'Pending'),
    placementOfficerEmail: body.placementOfficerEmail ?? '',
    isDiscontinued: Boolean(body.isDiscontinued),
  }
}

function isInternalBatch(batchOrType) {
  return typeof batchOrType === 'string'
    ? batchOrType === 'Internal'
    : batchOrType.batchType === 'Internal/Mavericks' || batchOrType.trainingType === 'Internal'
}

function validateBatchInput(body) {
  if (!body?.batchId || !body?.trainingName || !body?.trainingType || !body?.status) {
    return 'Batch ID, training name, training type, and status are required.'
  }

  if (body.scheduleType && !scheduleTypes.includes(body.scheduleType)) {
    return 'Schedule Type must be All Days or Custom Dates.'
  }

  if (body.scheduleType === 'Custom Dates' && !body.customDates) {
    return 'Custom Dates is required for Custom Dates schedule.'
  }

  if (body.trainerType && !trainerTypes.includes(body.trainerType)) {
    return 'Trainer Type must be External or Hexavarsity.'
  }

  if (body.trainerType === 'External' && !(body.trainerEmail || body.trainer?.email)) {
    return 'Trainer Email is required for External trainers.'
  }

  if (
    body.trainerType === 'Hexavarsity' &&
    (!body.trainerEmpId || !body.trainerUnitOrCompetency)
  ) {
    return 'Trainer Emp ID and Trainer Unit/Competency are required for Hexavarsity trainers.'
  }

  if (body.meetingPlatform && !meetingPlatforms.includes(body.meetingPlatform)) {
    return 'Meeting Platform must be Teams or Webex.'
  }

  if (body.batchType && !batchTypes.includes(body.batchType)) {
    return 'Batch Type must be Internal/Mavericks or External/Segue.'
  }

  if (body.coordinatorSpoc && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.coordinatorSpoc)) {
    return 'Coordinator/SPOC must be a valid email address for alert delivery.'
  }

  return null
}

function validateParticipantInput(body, batchOrType) {
  if (isInternalBatch(batchOrType)) {
    if (!body?.empId || !(body?.empName || body?.name)) {
      return 'Emp ID and Emp Name are required.'
    }

    return null
  }

  if (
    !body?.supersetId ||
    !(body?.name || body?.empName) ||
    !(body?.email || body?.officialEmail) ||
    !body?.collegeName ||
    !body?.placementOfficerEmail
  ) {
    return 'Superset ID, Emp Name, Emp Email, College Name, and Placement Officer Mail ID are required.'
  }

  return null
}

function participantIdentifier(body, batchOrType) {
  return isInternalBatch(batchOrType)
    ? String(body?.empId ?? '').trim()
    : String(body?.supersetId ?? '').trim()
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function participantEmailInput(body, batchOrType) {
  return isInternalBatch(batchOrType)
    ? body?.officialEmail ?? body?.email ?? ''
    : body?.email ?? body?.officialEmail ?? ''
}

function getNewParticipantData(body, trainingType) {
  return getParticipantData({ ...body, id: randomUUID() }, trainingType)
}

function updatedParticipantData(body, trainingType) {
  const data = getParticipantData(body, trainingType)
  delete data.id
  return data
}

batchesRouter.get('/batches', staffReadAccess, async (_request, response, next) => {
  try {
    const batches = await prisma.batch.findMany({
      include: { participants: true },
      orderBy: [{ startDate: 'desc' }, { batchCode: 'asc' }],
    })

    response.json({
      data: batches.map((batch) => mapBatch(batch, { includeParticipants: true })),
    })
  } catch (error) {
    next(error)
  }
})

batchesRouter.post('/batches', canManageBatches, async (request, response, next) => {
  try {
    const validationError = validateBatchInput(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const invalidParticipant = (request.body.participants ?? [])
      .map((participant) => validateParticipantInput(participant, {
        batchType: request.body.batchType,
        trainingType: request.body.trainingType,
      }))
      .find(Boolean)

    if (invalidParticipant) {
      response.status(400).json({ error: invalidParticipant })
      return
    }

    const batch = await prisma.batch.create({
      data: {
        ...getBatchData(request.body),
        participants: {
          create: (request.body.participants ?? []).map((participant) =>
            getParticipantData(participant, request.body.trainingType),
          ),
        },
      },
      include: { participants: true },
    })

    response.status(201).json({
      data: mapBatch(batch, { includeParticipants: true }),
    })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Batch ID already exists.' })
      return
    }

    next(error)
  }
})

batchesRouter.get('/batches/:batchId', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
      include: { participants: true },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({ data: mapBatch(batch, { includeParticipants: true }) })
  } catch (error) {
    next(error)
  }
})

batchesRouter.put('/batches/:batchId', canManageBatches, async (request, response, next) => {
  try {
    const validationError = validateBatchInput(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const existingBatch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!existingBatch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const batch = await prisma.batch.update({
      where: { batchCode: request.params.batchId },
      data: getBatchData(request.body),
      include: { participants: true },
    })

    response.json({
      data: mapBatch(batch, { includeParticipants: true }),
    })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Batch ID already exists.' })
      return
    }

    next(error)
  }
})

batchesRouter.patch('/batches/:batchId/status', canManageBatches, async (request, response, next) => {
  try {
    if (!request.body?.status) {
      response.status(400).json({ error: 'Status is required.' })
      return
    }

    const batch = await prisma.batch.update({
      where: { batchCode: request.params.batchId },
      data: { status: request.body.status },
      include: { participants: true },
    })

    response.json({
      data: mapBatch(batch, { includeParticipants: true }),
    })
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    next(error)
  }
})

batchesRouter.get('/batches/:batchId/lifecycle', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await getBatchWithLifecycleData(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({
      data: calculateBatchLifecycle(mapLifecycleBatch(batch), batch.logs),
    })
  } catch (error) {
    next(error)
  }
})

batchesRouter.patch('/batches/:batchId/assessment-deadline', canManageBatches, async (request, response, next) => {
  try {
    if (!request.body?.assessmentScoreDeadline) {
      response.status(400).json({ error: 'Assessment score deadline is required.' })
      return
    }

    const batch = await prisma.batch.update({
      where: { batchCode: request.params.batchId },
      data: {
        assessmentScoreDeadline: new Date(request.body.assessmentScoreDeadline),
      },
      include: { participants: true },
    })

    response.json({ data: mapBatch(batch, { includeParticipants: true }) })
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    next(error)
  }
})

batchesRouter.post('/batches/:batchId/reminders/attendance', canRemindTrainer, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const assignedTrainerEmails = [
      ...(Array.isArray(batch.assignedTrainers)
        ? batch.assignedTrainers.map((trainer) => trainer?.email)
        : []),
      batch.trainerEmail,
    ].filter(Boolean)
    const recipients = [...new Set(assignedTrainerEmails)]
    const trainingDate = request.body?.date ?? new Date().toISOString().slice(0, 10)

    if (!recipients.length) {
      await persistSkippedEmailLog(batch, {
        event: 'attendance_upload_reminder',
        type: 'Attendance',
        recipients: [],
      }, 'No trainer email is assigned to this batch.')
      const warning = await createReminderLog(batch, {
        action: 'attendance_reminder_skipped',
        category: 'alert',
        level: 'Warning',
        message: `Attendance reminder skipped for ${batch.trainingName}: no trainer email is assigned.`,
        recipient: '',
        status: 'Skipped',
        type: 'Attendance',
      })
      console.warn(warning.message)
      response.status(400).json({ error: warning.message })
      return
    }

    const delivery = await persistNotification(batch, {
      event: 'attendance_upload_reminder',
      eventDate: trainingDate,
      type: 'Attendance',
      recipients,
      message: `Attendance upload reminder sent to assigned trainer(s) for ${batch.trainingName} on ${trainingDate}.`,
      context: {
        recipientType: 'trainer',
        eventType: 'attendance_upload_reminder',
        batchName: batch.trainingName,
        trainerName: batch.trainerName ?? '',
        trainingDate,
        uploadDeadline: request.body?.uploadDeadline ?? batch.timings ?? '',
        recommendedAction: 'Please upload attendance promptly and confirm completion.',
      },
    })
    const log = await createReminderLog(batch, {
      ...createAttendanceReminderLog(mapBatch(batch), trainingDate),
      recipient: recipients.join(', '),
      status: delivery.emailResult.status,
    })

    response.status(201).json({ data: { log, deliveryStatus: delivery.emailResult.status, recipients } })
  } catch (error) {
    next(error)
  }
})

batchesRouter.post('/batches/:batchId/reminders/assessment', canRemindTrainer, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
      include: { participants: true },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const participants = (batch.participants ?? []).filter((participant) => participant.email)
    if (!participants.length) {
      response.status(400).json({ error: `Assessment reminder skipped for ${batch.trainingName}: no participant email is available.` })
      return
    }
    const deliveries = []
    for (const participant of participants) {
      const result = await persistNotification(batch, {
        event: 'assessment_reminder',
        participantId: participant.id,
        type: 'Assessment',
        recipients: [participant.email],
        message: `Assessment reminder sent to ${participant.name} for ${batch.trainingName}.`,
        context: {
          recipientType: 'participant',
          eventType: 'assessment_reminder',
          participantName: participant.name,
          participantEmail: participant.email,
          batchName: batch.trainingName,
          trainerName: batch.trainerName ?? '',
          dueDate: request.body?.dueDate ?? batch.assessmentDates ?? '',
          recommendedAction: 'Please complete your assessment within the defined timeline.',
        },
      })
      deliveries.push({ participantId: participant.id, recipient: participant.email, status: result.emailResult.status })
    }
    const log = await createReminderLog(batch, {
      ...createAssessmentReminderLog(mapBatch(batch)),
      recipient: participants.map((participant) => participant.email).join(', '),
      status: deliveries.some((delivery) => delivery.status === 'Failed') ? 'Failed' : 'Sent',
    })

    response.status(201).json({ data: { log, deliveries, recipients: participants.map((participant) => participant.email) } })
  } catch (error) {
    next(error)
  }
})

batchesRouter.patch('/batches/:batchId/close', canManageBatches, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const closedBatch = await prisma.batch.update({
      where: { batchCode: request.params.batchId },
      data: { status: 'Closed' },
      include: { participants: true },
    })

    response.json({ data: mapBatch(closedBatch, { includeParticipants: true }) })
  } catch (error) {
    next(error)
  }
})

batchesRouter.delete('/batches/:batchId', canManageBatches, async (request, response, next) => {
  try {
    await prisma.batch.delete({
      where: { batchCode: request.params.batchId },
    })

    response.status(204).send()
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    next(error)
  }
})

batchesRouter.get('/batches/:batchId/participants', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
      include: {
        participants: {
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    response.json({
      data: batch.participants.map((participant) =>
        mapParticipant(participant, batch.trainingType),
      ),
    })
  } catch (error) {
    next(error)
  }
})

batchesRouter.post('/batches/:batchId/participants', canManageBatches, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const validationError = validateParticipantInput(request.body, batch)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const identifier = participantIdentifier(request.body, batch)
    const existingParticipant = await prisma.participant.findFirst({
      where: {
        batchId: batch.id,
        ...(isInternalBatch(batch) ? { empId: identifier } : { supersetId: identifier }),
      },
    })
    const participant = existingParticipant
      ? await prisma.participant.update({
          where: { id: existingParticipant.id },
          data: updatedParticipantData(request.body, batch.trainingType),
        })
      : await prisma.participant.create({
          data: {
            ...getNewParticipantData(request.body, batch.trainingType),
            batchId: batch.id,
          },
        })

    response.status(existingParticipant ? 200 : 201).json({
      data: {
        ...mapParticipant(participant, batch.trainingType),
        uploadOutcome: existingParticipant ? 'Updated' : 'Created',
      },
    })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Participant identity conflicts with another stored participant. Review the identifier and retry.' })
      return
    }

    next(error)
  }
})

batchesRouter.post('/batches/:batchId/participants/upload', canManageBatches, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
      include: { participants: true },
    })
    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }
    if (!Array.isArray(request.body?.rows) || !request.body.rows.length) {
      response.status(400).json({ error: 'Upload must include at least one participant row.' })
      return
    }

    const rows = request.body.rows.map((entry, index) => ({
      rowNumber: Number(entry.rowNumber ?? index + 2),
      participant: entry.participant ?? entry,
    }))
    const errors = []
    const identifiers = new Map()
    const emails = new Map()
    const existingParticipants = batch.participants ?? []
    const existingByIdentifier = new Map(
      existingParticipants.map((participant) => [
        normalized(isInternalBatch(batch) ? participant.empId : participant.supersetId),
        participant,
      ]),
    )
    const existingByEmail = new Map(
      existingParticipants
        .filter((participant) => normalized(participant.email))
        .map((participant) => [normalized(participant.email), participant]),
    )

    rows.forEach(({ participant, rowNumber }) => {
      const messages = []
      const validationError = validateParticipantInput(participant, batch)
      if (validationError) messages.push(validationError)
      const identifier = participantIdentifier(participant, batch)
      const key = normalized(identifier)
      const email = normalized(participantEmailInput(participant, batch))

      if (key && identifiers.has(key)) {
        messages.push(`Duplicate ${isInternalBatch(batch) ? 'Emp ID' : 'Superset ID'} "${identifier}" also appears on row ${identifiers.get(key)}.`)
      } else if (key) {
        identifiers.set(key, rowNumber)
      }
      if (email && emails.has(email)) {
        messages.push(`Duplicate email "${participantEmailInput(participant, batch)}" also appears on row ${emails.get(email)}.`)
      } else if (email) {
        emails.set(email, rowNumber)
      }
      const existingForEmail = email ? existingByEmail.get(email) : null
      const existingForIdentifier = key ? existingByIdentifier.get(key) : null
      if (existingForEmail && existingForIdentifier?.id !== existingForEmail.id) {
        messages.push(`Email "${participantEmailInput(participant, batch)}" already belongs to a different participant in this batch.`)
      }
      if (messages.length) {
        errors.push({ rowNumber, identifier, messages })
      }
    })

    if (errors.length) {
      response.status(400).json({
        error: 'Participant upload contains validation errors.',
        details: errors,
      })
      return
    }

    const created = []
    const updated = []
    for (const { participant } of rows) {
      const key = normalized(participantIdentifier(participant, batch))
      const existing = existingByIdentifier.get(key)
      if (existing) {
        const saved = await prisma.participant.update({
          where: { id: existing.id },
          data: updatedParticipantData(participant, batch.trainingType),
        })
        updated.push(mapParticipant(saved, batch.trainingType))
      } else {
        const saved = await prisma.participant.create({
          data: {
            ...getNewParticipantData(participant, batch.trainingType),
            batchId: batch.id,
          },
        })
        const mapped = mapParticipant(saved, batch.trainingType)
        created.push(mapped)
        existingByIdentifier.set(key, saved)
      }
    }

    response.json({
      data: {
        created: created.length,
        updated: updated.length,
        skipped: 0,
        errors: [],
        participants: [...created, ...updated],
      },
    })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({
        error: 'A stored participant identity conflicts outside this batch. No duplicate participant was created.',
      })
      return
    }
    next(error)
  }
})

batchesRouter.put(
  '/batches/:batchId/participants/:participantId',
  canManageBatches,
  async (request, response, next) => {
    try {
      const batch = await prisma.batch.findUnique({
        where: { batchCode: request.params.batchId },
      })

      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const validationError = validateParticipantInput(request.body, batch)

      if (validationError) {
        response.status(400).json({ error: validationError })
        return
      }

      const existingParticipant = await prisma.participant.findFirst({
        where: {
          id: request.params.participantId,
          batchId: batch.id,
        },
      })

      if (!existingParticipant) {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      const participant = await prisma.participant.update({
        where: { id: existingParticipant.id },
        data: getParticipantData(
          { ...request.body, id: request.params.participantId },
          batch.trainingType,
        ),
      })

      response.json({
        data: mapParticipant(participant, batch.trainingType),
      })
    } catch (error) {
      if (error.code === 'P2025') {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      next(error)
    }
  },
)

batchesRouter.delete(
  '/batches/:batchId/participants/:participantId',
  canManageBatches,
  async (request, response, next) => {
    try {
      const batch = await prisma.batch.findUnique({
        where: { batchCode: request.params.batchId },
      })

      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const existingParticipant = await prisma.participant.findFirst({
        where: {
          id: request.params.participantId,
          batchId: batch.id,
        },
      })

      if (!existingParticipant) {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      await prisma.participant.delete({
        where: { id: existingParticipant.id },
      })

      response.status(204).send()
    } catch (error) {
      if (error.code === 'P2025') {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      next(error)
    }
  },
)

batchesRouter.patch(
  '/batches/:batchId/participants/:participantId/discontinue',
  canManageBatches,
  async (request, response, next) => {
    try {
      const batch = await prisma.batch.findUnique({
        where: { batchCode: request.params.batchId },
      })

      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const existingParticipant = await prisma.participant.findFirst({
        where: {
          id: request.params.participantId,
          batchId: batch.id,
        },
      })

      if (!existingParticipant) {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      const participant = await prisma.participant.update({
        where: { id: existingParticipant.id },
        data: { isDiscontinued: true },
      })

      response.json({
        data: mapParticipant(participant, batch.trainingType),
      })
    } catch (error) {
      if (error.code === 'P2025') {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      next(error)
    }
  },
)

batchesRouter.patch(
  '/batches/:batchId/participants/:participantId/onboarding',
  canManageBatches,
  async (request, response, next) => {
    try {
      const batch = await prisma.batch.findUnique({
        where: { batchCode: request.params.batchId },
      })

      if (!batch) {
        response.status(404).json({ error: 'Batch not found.' })
        return
      }

      const participant = await prisma.participant.update({
        where: { id: request.params.participantId },
        data: {
          isOnboarded: Boolean(request.body?.isOnboarded),
          onboardingStatus:
            request.body?.onboardingStatus ??
            (request.body?.isOnboarded ? 'Onboarded' : 'Pending'),
          placementOfficerEmail: request.body?.placementOfficerEmail ?? undefined,
        },
      })

      response.json({
        data: mapParticipant(participant, batch.trainingType),
      })
    } catch (error) {
      if (error.code === 'P2025') {
        response.status(404).json({ error: 'Participant not found.' })
        return
      }

      next(error)
    }
  },
)
