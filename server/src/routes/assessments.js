import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { staffReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapAssessment } from '../mappers.js'
import { persistNotificationOnce } from './notifications.js'

export const assessmentsRouter = Router()

const canManageAssessments = [requireAuth, requireRole('Coordinator', 'Trainer')]

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

function getAssessmentData(body) {
  return {
    id: body.id ?? `ASM-${Date.now().toString().slice(-6)}`,
    name: body.name,
    type: body.type,
    date: parseDate(body.date),
    cutoffScore: Number(body.cutoffScore),
    maxScore: Number(body.maxScore),
    weightage: Number(body.weightage),
    questionFileName: body.questionFileName ?? null,
    questionFileUploadedAt: body.questionFileUploadedAt
      ? new Date(body.questionFileUploadedAt)
      : null,
  }
}

function validateAssessmentInput(body) {
  if (!body?.name || !body?.type) {
    return 'Assessment name and type are required.'
  }

  for (const field of ['cutoffScore', 'maxScore', 'weightage']) {
    const value = Number(body[field])

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return `${field} must be between 0 and 100.`
    }
  }

  return null
}

function validateResultsInput(body) {
  if (!Array.isArray(body?.results) || !body.results.length) {
    return 'At least one assessment result is required.'
  }

  const seenParticipants = new Set()

  for (const result of body.results) {
    if (!result.participantId || !result.name) {
      return 'Each result requires participantId and name.'
    }

    const scorePercent = Number(result.scorePercent)

    if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
      return 'Each scorePercent must be between 0 and 100.'
    }

    if (seenParticipants.has(result.participantId)) {
      return 'Duplicate participant result in upload.'
    }

    seenParticipants.add(result.participantId)
  }

  return null
}

async function findBatch(batchId) {
  return prisma.batch.findUnique({
    where: { batchCode: batchId },
    include: { participants: true },
  })
}

async function findAssessment(batchId, assessmentId) {
  return prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      batch: { batchCode: batchId },
    },
    include: { evidenceFiles: true, results: true },
  })
}

function calculateStats(batch, assessments) {
  const results = assessments.flatMap((assessment) => assessment.results ?? [])
  const participantIdsWithScores = new Set(results.map((result) => result.participantId))
  const notClearedIds = new Set(
    results.filter((result) => !result.cleared).map((result) => result.participantId),
  )
  const clearedIds = new Set(
    results.filter((result) => result.cleared).map((result) => result.participantId),
  )
  const totalParticipants = batch.participants?.length ?? 0

  return {
    latestAssessment: assessments.find((assessment) => assessment.results?.length)
      ? mapAssessment(assessments.find((assessment) => assessment.results?.length))
      : null,
    totalParticipants,
    assessed: participantIdsWithScores.size,
    cleared: clearedIds.size,
    notCleared: notClearedIds.size,
    remaining: Math.max(totalParticipants - participantIdsWithScores.size, 0),
    clearanceRate: totalParticipants
      ? Math.round((clearedIds.size / totalParticipants) * 100)
      : 0,
  }
}

function calculateToppers(assessments) {
  const firstAttemptByParticipant = new Map()

  assessments.forEach((assessment) => {
    ;(assessment.results ?? []).forEach((result) => {
      if (firstAttemptByParticipant.has(result.participantId)) return

      const firstAttemptScore = Number(result.firstAttemptScore ?? result.scorePercent ?? 0)
      const cutoffScore = Number(assessment.cutoffScore ?? 0)
      const firstAttemptStatus =
        result.firstAttemptStatus ?? (firstAttemptScore >= cutoffScore ? 'Cleared' : 'Not Cleared')

      firstAttemptByParticipant.set(result.participantId, {
        participantId: result.participantId,
        empId: result.empId,
        name: result.name,
        email: result.email,
        firstAttemptScore,
        firstAttemptStatus,
        latestScore: Number(result.latestScore ?? result.scorePercent ?? firstAttemptScore),
      })
    })
  })

  return Array.from(firstAttemptByParticipant.values())
    .filter((entry) => entry.firstAttemptStatus === 'Cleared')
    .map((entry) => ({
      ...entry,
      finalScore: Math.round(entry.firstAttemptScore),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
}

async function getBatchAssessments(batchId) {
  return prisma.assessment.findMany({
    where: { batch: { batchCode: batchId } },
    include: {
      evidenceFiles: true,
      results: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })
}

assessmentsRouter.get('/batches/:batchId/assessments/stats', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const assessments = await getBatchAssessments(request.params.batchId)
    response.json({ data: calculateStats(batch, assessments) })
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.get('/batches/:batchId/assessments/toppers', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const assessments = await getBatchAssessments(request.params.batchId)
    response.json({ data: calculateToppers(assessments) })
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.get('/batches/:batchId/assessments', staffReadAccess, async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const assessments = await getBatchAssessments(request.params.batchId)
    response.json({ data: assessments.map(mapAssessment) })
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.post(
  '/batches/:batchId/assessments',
  canManageAssessments,
  async (request, response, next) => {
  try {
    const validationError = validateAssessmentInput(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const assessment = await prisma.assessment.create({
      data: {
        ...getAssessmentData(request.body),
        batchId: batch.id,
      },
      include: { evidenceFiles: true, results: true },
    })

    response.status(201).json({ data: mapAssessment(assessment) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Assessment ID already exists.' })
      return
    }

    next(error)
  }
  },
)

assessmentsRouter.put(
  '/batches/:batchId/assessments/:assessmentId',
  canManageAssessments,
  async (request, response, next) => {
    try {
      const validationError = validateAssessmentInput(request.body)

      if (validationError) {
        response.status(400).json({ error: validationError })
        return
      }

      const existingAssessment = await findAssessment(
        request.params.batchId,
        request.params.assessmentId,
      )

      if (!existingAssessment) {
        response.status(404).json({ error: 'Assessment not found.' })
        return
      }

      const assessmentData = getAssessmentData({
        ...request.body,
        id: existingAssessment.id,
      })
      delete assessmentData.id

      const assessment = await prisma.assessment.update({
        where: { id: existingAssessment.id },
        data: assessmentData,
        include: { evidenceFiles: true, results: true },
      })

      response.json({ data: mapAssessment(assessment) })
    } catch (error) {
      next(error)
    }
  },
)

assessmentsRouter.delete(
  '/batches/:batchId/assessments/:assessmentId',
  canManageAssessments,
  async (request, response, next) => {
    try {
      const existingAssessment = await findAssessment(
        request.params.batchId,
        request.params.assessmentId,
      )

      if (!existingAssessment) {
        response.status(404).json({ error: 'Assessment not found.' })
        return
      }

      await prisma.assessment.delete({
        where: { id: existingAssessment.id },
      })

      response.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

assessmentsRouter.post(
  '/batches/:batchId/assessments/:assessmentId/results',
  canManageAssessments,
  async (request, response, next) => {
    try {
      const validationError = validateResultsInput(request.body)

      if (validationError) {
        response.status(400).json({ error: validationError })
        return
      }

      const batch = await findBatch(request.params.batchId)
      const assessment = await findAssessment(
        request.params.batchId,
        request.params.assessmentId,
      )

      if (!batch || !assessment) {
        response.status(404).json({ error: 'Assessment not found.' })
        return
      }

      const participantIds = new Set(batch.participants.map((participant) => participant.id))
      const invalidResult = request.body.results.find(
        (result) => !participantIds.has(result.participantId),
      )

      if (invalidResult) {
        response.status(400).json({ error: 'One or more results do not belong to this batch.' })
        return
      }

      const outOfRangeResult = request.body.results.find(
        (result) =>
          Number(result.scorePercent) < 0 ||
          Number(result.scorePercent) > Number(assessment.maxScore ?? 100),
      )

      if (outOfRangeResult) {
        response.status(400).json({
          error: `Each scorePercent must be between 0 and ${assessment.maxScore}.`,
        })
        return
      }

      const uploadedAt = new Date()

      const updatedAssessment = await prisma.assessment.update({
        where: { id: assessment.id },
        data: {
          uploadedFileName: request.body.uploadedFileName ?? null,
          uploadedAt,
          results: {
            create: request.body.results.map((result) => ({
              participantId: result.participantId,
              empId: result.empId ?? '',
              name: result.name,
              email: result.email ?? '',
              scorePercent: Number(result.scorePercent),
              comments: result.comments ?? '',
              cleared: Number(result.scorePercent) >= assessment.cutoffScore,
              uploadedAt: result.uploadedAt ? new Date(result.uploadedAt) : uploadedAt,
            })),
          },
        },
        include: { evidenceFiles: true, results: true },
      })

      for (const result of request.body.results ?? []) {
        if (result.cleared) continue

        const participant = batch.participants.find((entry) => entry.id === result.participantId)
        if (!participant) continue

        const lowScoreDetails =
          `${assessment.name}: score ${result.scorePercent}% is below cutoff ${assessment.cutoffScore}%.`
        const baseContext = {
          participantName: participant.name,
          participantEmail: participant.email ?? '',
          placementOfficerEmail: participant.placementOfficerEmail ?? '',
          collegeName: participant.collegeName ?? '',
          batchName: batch.trainingName,
          trainerName: batch.trainerName ?? '',
          lowScoreDetails,
          recommendedAction: 'Please coordinate remediation and prepare for the next permitted attempt.',
        }

        await persistNotificationOnce(batch, {
          event: 'low_assessment_score',
          participantId: participant.id,
          type: 'Assessment',
          recipients: [participant.email].filter(Boolean),
          message: `${participant.name} scored below cutoff in ${assessment.name}.`,
          context: {
            ...baseContext,
            recipientType: 'participant',
            eventType: 'low_assessment_score',
          },
        })

        const isExternal = batch.batchType
          ? batch.batchType === 'External/Segue'
          : batch.trainingType !== 'Internal'
        if (isExternal && participant.placementOfficerEmail) {
          await persistNotificationOnce(batch, {
            event: 'placement_officer_low_assessment_score_escalation',
            participantId: participant.id,
            type: 'Escalation',
            recipients: [participant.placementOfficerEmail],
            message: `${participant.name} scored below cutoff in ${assessment.name}.`,
            context: {
              ...baseContext,
              recipientType: 'placementOfficer',
              eventType: 'placement_officer_escalation',
            },
          })
        } else if (isExternal) {
          console.warn(`Placement officer escalation skipped for ${participant.id}: email is missing.`)
        }
      }

      response.status(201).json({ data: mapAssessment(updatedAssessment) })
    } catch (error) {
      next(error)
    }
  },
)

assessmentsRouter.post(
  '/batches/:batchId/assessments/:assessmentId/evidence',
  canManageAssessments,
  async (request, response, next) => {
    try {
      const assessment = await findAssessment(
        request.params.batchId,
        request.params.assessmentId,
      )

      if (!assessment) {
        response.status(404).json({ error: 'Assessment not found.' })
        return
      }

      if (!request.body?.name) {
        response.status(400).json({ error: 'Evidence file name is required.' })
        return
      }

      const evidence = await prisma.assessmentEvidence.create({
        data: {
          id: request.body.id ?? `EV-${Date.now().toString().slice(-6)}`,
          assessmentId: assessment.id,
          fileName: request.body.name,
          fileSize: Number(request.body.size ?? 0),
          uploadedAt: request.body.uploadedAt ? new Date(request.body.uploadedAt) : new Date(),
        },
      })

      response.status(201).json({
        data: {
          id: evidence.id,
          name: evidence.fileName,
          size: evidence.fileSize ?? 0,
          uploadedAt: evidence.uploadedAt.toISOString(),
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

assessmentsRouter.delete(
  '/batches/:batchId/assessments/:assessmentId/evidence/:evidenceId',
  canManageAssessments,
  async (request, response, next) => {
    try {
      const assessment = await findAssessment(
        request.params.batchId,
        request.params.assessmentId,
      )

      if (!assessment) {
        response.status(404).json({ error: 'Assessment not found.' })
        return
      }

      await prisma.assessmentEvidence.delete({
        where: { id: request.params.evidenceId },
      })

      response.status(204).send()
    } catch (error) {
      if (error.code === 'P2025') {
        response.status(404).json({ error: 'Assessment evidence not found.' })
        return
      }

      next(error)
    }
  },
)
