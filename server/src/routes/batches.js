import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'
import { mapBatch, mapParticipant } from '../mappers.js'
import {
  calculateBatchLifecycle,
  createAssessmentReminderLog,
  createAttendanceReminderLog,
} from '../../../src/utils/batchLifecycle.js'

export const batchesRouter = Router()

const canManageBatches = [requireAuth, requireRole('Admin', 'Coordinator')]
const canRemindTrainer = [requireAuth, requireRole('Admin', 'Coordinator', 'Trainer')]
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
    timings: body.timings ?? '',
    status: body.status,
    assessmentScoreDeadline: body.assessmentScoreDeadline
      ? new Date(body.assessmentScoreDeadline)
      : null,
    trainerType: body.trainerType ?? '',
    trainerName: body.trainer?.name ?? body.trainerName ?? '',
    trainerEmail: body.trainer?.email ?? body.trainerEmail ?? '',
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

  return null
}

function validateParticipantInput(body, trainingType) {
  if (trainingType === 'Internal') {
    if (!body?.empId || !(body?.empName || body?.name)) {
      return 'Emp ID and Emp Name are required.'
    }

    return null
  }

  if (!body?.name || !body?.email || !body?.mobileNumber) {
    return 'Name, email, and mobile number are required.'
  }

  return null
}

batchesRouter.get('/batches', async (_request, response, next) => {
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

batchesRouter.get('/batches/:batchId', async (request, response, next) => {
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

batchesRouter.get('/batches/:batchId/lifecycle', async (request, response, next) => {
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

    const log = await createReminderLog(
      batch,
      createAttendanceReminderLog(mapBatch(batch), request.body?.date),
    )

    response.status(201).json({ data: log })
  } catch (error) {
    next(error)
  }
})

batchesRouter.post('/batches/:batchId/reminders/assessment', canRemindTrainer, async (request, response, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { batchCode: request.params.batchId },
    })

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const log = await createReminderLog(batch, createAssessmentReminderLog(mapBatch(batch)))

    response.status(201).json({ data: log })
  } catch (error) {
    next(error)
  }
})

batchesRouter.patch('/batches/:batchId/close', canManageBatches, async (request, response, next) => {
  try {
    const batch = await getBatchWithLifecycleData(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const lifecycle = calculateBatchLifecycle(mapLifecycleBatch(batch), batch.logs)

    if (!lifecycle.canClose) {
      response.status(409).json({ error: 'Batch is not ready to close.' })
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

batchesRouter.get('/batches/:batchId/participants', async (request, response, next) => {
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

    const validationError = validateParticipantInput(request.body, batch.trainingType)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const participant = await prisma.participant.create({
      data: {
        ...getParticipantData(request.body, batch.trainingType),
        batchId: batch.id,
      },
    })

    response.status(201).json({
      data: mapParticipant(participant, batch.trainingType),
    })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Participant ID already exists.' })
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

      const validationError = validateParticipantInput(request.body, batch.trainingType)

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
