import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { coordinatorReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapFeedbackRun } from '../mappers.js'
import { persistNotificationOnce, persistSkippedEmailLog } from './notifications.js'

export const feedbackRouter = Router()

const canManageFeedback = [requireAuth, requireRole('Coordinator')]
const participantFeedbackAccess = [requireAuth, requireRole('Participant')]

function generateFeedbackSummary(responses = []) {
  if (!responses.length) {
    return 'Feedback has not been uploaded yet.'
  }

  const average = (values) => {
    const ratings = values
      .map((value) => Number(value))
      .filter((rating) => Number.isFinite(rating))

    return ratings.length
      ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
      : 'N/A'
  }
  const ratings = responses
    .map((response) => response.rating)
    .filter((rating) => Number.isFinite(rating))
  const averageRating = average(ratings)
  const averageContentQuality = average(
    responses.map((response) => response.contentQualityRating ?? response.rating),
  )
  const averageTrainerEffectiveness = average(
    responses.map((response) => response.trainerEffectivenessRating ?? response.rating),
  )
  const unmatched = responses.filter((response) => !response.matched).length
  const comments = responses.filter((response) => response.comments).length

  return `Average feedback rating is ${averageRating}/5 from ${responses.length} responses. Training content quality average is ${averageContentQuality}/5. Trainer effectiveness average is ${averageTrainerEffectiveness}/5. ${comments} responses include comments. ${unmatched} responses need roster review.`
}

function getFeedbackWindowSummary(body = {}) {
  const parts = []

  if (body.startAt) parts.push(`Start: ${body.startAt}`)
  if (body.endAt) parts.push(`End: ${body.endAt}`)
  if (body.closureDeadline) parts.push(`Closure: ${body.closureDeadline}`)

  return parts.length
    ? `Feedback has been triggered. Window ${parts.join(', ')}.`
    : 'Feedback has not been uploaded yet.'
}

function parseDateTime(value) {
  return value ? new Date(value) : null
}

async function findBatch(batchId) {
  return prisma.batch.findUnique({
    where: { batchCode: batchId },
    include: { participants: true },
  })
}

async function getLatestFeedbackRun(batchId) {
  return prisma.feedbackRun.findFirst({
    where: { batch: { batchCode: batchId } },
    include: {
      responses: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function getOrCreateFeedbackRun(batch) {
  const existingRun = await getLatestFeedbackRun(batch.batchCode)

  if (existingRun) {
    return existingRun
  }

  return prisma.feedbackRun.create({
    data: {
      batchId: batch.id,
      summary: 'Feedback has not been uploaded yet.',
    },
    include: { responses: true },
  })
}

function validateResponsesInput(body) {
  if (!Array.isArray(body?.responses)) {
    return 'Responses must be an array.'
  }

  for (const response of body.responses) {
    if (!response.id || (!response.name && !response.email)) {
      return 'Each response requires id and at least name or email.'
    }

    if (
      response.rating !== null &&
      response.rating !== undefined &&
      (!Number.isFinite(Number(response.rating)) ||
        Number(response.rating) < 0 ||
        Number(response.rating) > 5)
    ) {
      return 'Each rating must be between 0 and 5.'
    }
  }

  return null
}

feedbackRouter.get('/batches/:batchId/feedback', coordinatorReadAccess, async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const feedbackRun = await getLatestFeedbackRun(request.params.batchId)
    response.json({ data: mapFeedbackRun(feedbackRun) })
  } catch (error) {
    next(error)
  }
})

feedbackRouter.post(
  '/batches/:batchId/feedback/trigger',
  canManageFeedback,
  async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const currentRun = await getOrCreateFeedbackRun(batch)
    const eligibleParticipantIds = Array.isArray(request.body?.eligibleParticipantIds)
      ? [...new Set(request.body.eligibleParticipantIds)]
      : []
    if (!eligibleParticipantIds.length) {
      response.status(400).json({ error: 'Upload at least one eligible feedback participant before triggering feedback.' })
      return
    }
    const selectedParticipants = (batch.participants ?? []).filter((participant) =>
      eligibleParticipantIds.includes(participant.id),
    )
    if (selectedParticipants.length !== eligibleParticipantIds.length) {
      response.status(400).json({ error: 'One or more feedback recipients do not belong to this batch.' })
      return
    }
    const feedbackRun = await prisma.feedbackRun.update({
      where: { id: currentRun.id },
      data: {
        triggeredAt: new Date(),
        startAt: parseDateTime(request.body?.startAt),
        endAt: parseDateTime(request.body?.endAt),
        closureDeadline: parseDateTime(request.body?.closureDeadline),
        closedAt: null,
        feedbackLink: request.body?.feedbackLink ?? null,
        eligibleParticipantIds,
        summary: getFeedbackWindowSummary(request.body) ?? currentRun.summary,
      },
      include: {
        responses: {
          orderBy: { name: 'asc' },
        },
      },
    })

    for (const participant of selectedParticipants) {
      const recipient = participant.email ?? participant.officialEmail
      if (!recipient) {
        await persistSkippedEmailLog(batch, {
          event: 'feedback_request',
          participantId: participant.id,
          type: 'Feedback',
          recipients: [],
        }, 'Eligible participant does not have an email address.')
        continue
      }

      await persistNotificationOnce(batch, {
        event: 'feedback_request',
        participantId: participant.id,
        type: 'Feedback',
        recipients: [recipient],
        message: `Feedback requested from ${participant.name} for ${batch.trainingName}.`,
        context: {
          recipientType: 'participant',
          eventType: 'feedback_request',
          participantName: participant.name,
          participantEmail: recipient,
          collegeName: participant.collegeName ?? '',
          batchName: batch.trainingName,
          trainerName: batch.trainerName ?? '',
          feedbackLink: request.body?.feedbackLink ?? '',
          dueDate: request.body?.closureDeadline ?? '',
          recommendedAction: 'Please submit your feedback before the closure date.',
        },
      })
    }

    response.json({ data: mapFeedbackRun(feedbackRun) })
  } catch (error) {
    next(error)
  }
  },
)

feedbackRouter.post(
  '/batches/:batchId/feedback/responses',
  canManageFeedback,
  async (request, response, next) => {
  try {
    const validationError = validateResponsesInput(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const currentRun = await getOrCreateFeedbackRun(batch)
    if (currentRun.closedAt || (currentRun.closureDeadline && new Date() > currentRun.closureDeadline)) {
      response.status(409).json({ error: 'Feedback window is closed.' })
      return
    }
    const participantIds = new Set(batch.participants.map((participant) => participant.id))
    const invalidResponse = request.body.responses.find(
      (feedbackResponse) =>
        feedbackResponse.participantId &&
        !participantIds.has(feedbackResponse.participantId),
    )

    if (invalidResponse) {
      response.status(400).json({ error: 'One or more responses do not belong to this batch.' })
      return
    }

    const uploadedAt = new Date()
    const summary = request.body.summary ?? generateFeedbackSummary(request.body.responses)

    await prisma.feedbackResponse.deleteMany({
      where: { feedbackRunId: currentRun.id },
    })

    const feedbackRun = await prisma.feedbackRun.update({
      where: { id: currentRun.id },
      data: {
        uploadedFileName: request.body.uploadedFileName ?? null,
        uploadedAt,
        summary,
        responses: {
          create: request.body.responses.map((feedbackResponse) => ({
            id: feedbackResponse.id,
            participantId: feedbackResponse.participantId || null,
            empId: feedbackResponse.empId ?? null,
            supersetId: feedbackResponse.supersetId ?? null,
            name: feedbackResponse.name ?? null,
            email: feedbackResponse.email ?? null,
            rating:
              feedbackResponse.rating === null || feedbackResponse.rating === undefined
                ? null
                : Number(feedbackResponse.rating),
            comments: feedbackResponse.comments ?? null,
            topTakeaways: feedbackResponse.topTakeaways ?? null,
            improvements: feedbackResponse.improvements ?? null,
            courseImpact: feedbackResponse.courseImpact ?? null,
            assignmentUsefulness: feedbackResponse.assignmentUsefulness ?? null,
            demonstrationUsefulness: feedbackResponse.demonstrationUsefulness ?? null,
            trainerSupportFeedback: feedbackResponse.trainerSupportFeedback ?? null,
            technicalDiscussionUsefulness: feedbackResponse.technicalDiscussionUsefulness ?? null,
            matched: Boolean(feedbackResponse.matched),
            uploadedAt: feedbackResponse.uploadedAt
              ? new Date(feedbackResponse.uploadedAt)
              : uploadedAt,
          })),
        },
      },
      include: {
        responses: {
          orderBy: { name: 'asc' },
        },
      },
    })

    response.status(201).json({ data: mapFeedbackRun(feedbackRun) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Duplicate feedback response ID.' })
      return
    }

    next(error)
  }
  },
)

feedbackRouter.patch('/batches/:batchId/feedback/close', canManageFeedback, async (request, response, next) => {
  try {
    const currentRun = await getLatestFeedbackRun(request.params.batchId)
    if (!currentRun) {
      response.status(404).json({ error: 'Feedback run not found.' })
      return
    }
    const feedbackRun = await prisma.feedbackRun.update({
      where: { id: currentRun.id },
      data: { closedAt: new Date() },
      include: { responses: { orderBy: { name: 'asc' } } },
    })
    response.json({ data: mapFeedbackRun(feedbackRun) })
  } catch (error) {
    next(error)
  }
})

feedbackRouter.post(
  '/batches/:batchId/feedback/:feedbackRunId/submit',
  participantFeedbackAccess,
  async (request, response, next) => {
    try {
      const batch = await findBatch(request.params.batchId)
      const feedbackRun = await getLatestFeedbackRun(request.params.batchId)
      if (!batch || !feedbackRun || feedbackRun.id !== request.params.feedbackRunId) {
        response.status(404).json({ error: 'Feedback window not found.' })
        return
      }
      if (feedbackRun.closedAt || (feedbackRun.closureDeadline && new Date() > feedbackRun.closureDeadline)) {
        response.status(409).json({ error: 'Feedback window is closed.' })
        return
      }
      const participant = batch.participants.find(
        (entry) => entry.email?.toLowerCase() === request.user.email?.toLowerCase(),
      )
      const eligibleParticipantIds = Array.isArray(feedbackRun.eligibleParticipantIds)
        ? feedbackRun.eligibleParticipantIds
        : []
      if (!participant || !eligibleParticipantIds.includes(participant.id)) {
        response.status(403).json({ error: 'You are not selected for this feedback request.' })
        return
      }
      const rating = Number(request.body?.rating)
      const responseFields = [
        'topTakeaways',
        'improvements',
        'courseImpact',
        'assignmentUsefulness',
        'demonstrationUsefulness',
        'trainerSupportFeedback',
        'technicalDiscussionUsefulness',
        'comments',
      ]
      if (!Number.isFinite(rating) || rating < 1 || rating > 5 ||
        responseFields.some((field) => !String(request.body?.[field] ?? '').trim())) {
        response.status(400).json({ error: 'Please answer all feedback questions and select a trainer rating.' })
        return
      }
      const data = {
        feedbackRunId: feedbackRun.id,
        participantId: participant.id,
        empId: participant.empId ?? null,
        supersetId: participant.supersetId ?? null,
        name: participant.name,
        email: participant.email,
        rating,
        comments: request.body.comments,
        topTakeaways: request.body.topTakeaways,
        improvements: request.body.improvements,
        courseImpact: request.body.courseImpact,
        assignmentUsefulness: request.body.assignmentUsefulness,
        demonstrationUsefulness: request.body.demonstrationUsefulness,
        trainerSupportFeedback: request.body.trainerSupportFeedback,
        technicalDiscussionUsefulness: request.body.technicalDiscussionUsefulness,
        matched: true,
        uploadedAt: new Date(),
      }
      await prisma.feedbackResponse.upsert({
        where: { id: `${feedbackRun.id}-${participant.id}` },
        update: data,
        create: { id: `${feedbackRun.id}-${participant.id}`, ...data },
      })
      await prisma.feedbackRun.update({
        where: { id: feedbackRun.id },
        data: { uploadedAt: new Date() },
        include: { responses: true },
      })
      response.status(201).json({ data: { submitted: true } })
    } catch (error) {
      next(error)
    }
  },
)

feedbackRouter.get('/batches/:batchId/feedback/summary', coordinatorReadAccess, async (request, response, next) => {
  try {
    const batch = await findBatch(request.params.batchId)

    if (!batch) {
      response.status(404).json({ error: 'Batch not found.' })
      return
    }

    const feedbackRun = await getLatestFeedbackRun(request.params.batchId)
    const summary =
      feedbackRun?.summary ??
      generateFeedbackSummary(feedbackRun?.responses ?? [])

    response.json({ data: { summary } })
  } catch (error) {
    next(error)
  }
})
