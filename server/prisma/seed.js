import { PrismaClient } from '@prisma/client'
import { mockBatches, mockLogs } from '../../src/data/mockData.js'

const prisma = new PrismaClient()

const demoUsers = [
  {
    name: 'Mavericks Admin',
    email: 'admin@mavericks.demo',
    role: 'Admin',
  },
  {
    name: 'Mavericks Coordinator',
    email: 'coordinator@mavericks.demo',
    role: 'Coordinator',
  },
  {
    name: 'Avery Shah',
    email: 'trainer@mavericks.demo',
    role: 'Trainer',
  },
  {
    name: 'Neha Rao',
    email: 'participant@mavericks.demo',
    role: 'Participant',
  },
]

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

function toParticipantRecord(batch, participant) {
  const isInternal = batch.trainingType === 'Internal'

  return {
    id: participant.id,
    participantType: isInternal ? 'Internal' : 'External',
    empId: isInternal ? participant.empId ?? null : participant.empId ?? null,
    name: isInternal ? participant.empName : participant.name,
    email: isInternal ? participant.officialEmail ?? null : participant.email ?? null,
    supersetId: isInternal ? null : participant.supersetId ?? null,
    collegeName: isInternal ? null : participant.collegeName ?? null,
    mobileNumber: isInternal ? null : participant.mobileNumber ?? null,
    isDiscontinued: batch.discontinuedParticipantIds?.includes(participant.id) ?? false,
  }
}

function toAssessmentRecord(batch, assessment) {
  return {
    id: assessment.id,
    name: assessment.name,
    type: assessment.type,
    date: parseDate(assessment.date),
    cutoffScore: Number(assessment.cutoffScore ?? 70),
    maxScore: Number(assessment.maxScore ?? 100),
    weightage: Number(assessment.weightage ?? 100),
    uploadedFileName: assessment.uploadedFileName ?? null,
    uploadedAt: assessment.uploadedAt ? new Date(assessment.uploadedAt) : null,
    results: {
      create: (assessment.results ?? []).map((result) =>
        toAssessmentResultRecord(batch, assessment, result),
      ),
    },
  }
}

function toAssessmentResultRecord(batch, assessment, result) {
  const participant = batch.participants.find(
    (item) =>
      item.id === result.participantId ||
      item.empId === result.empId ||
      item.officialEmail === result.email ||
      item.email === result.email,
  )

  return {
    participantId: participant?.id ?? null,
    empId: result.empId ?? null,
    name: result.name,
    email: result.email ?? null,
    scorePercent: Number(result.scorePercent ?? 0),
    comments: result.comments ?? null,
    cleared:
      result.cleared ??
      (Number(result.scorePercent ?? 0) >= Number(assessment.cutoffScore ?? 0)),
    uploadedAt: result.uploadedAt ? new Date(result.uploadedAt) : new Date(),
  }
}

function findFeedbackParticipant(batch, response) {
  return batch.participants.find(
    (item) =>
      item.id === response.participantId ||
      item.empId === response.empId ||
      item.officialEmail === response.email ||
      item.email === response.email,
  )
}

function toFeedbackRunRecord(batch) {
  const feedback = batch.feedback

  return {
    triggeredAt: feedback.triggeredAt ? new Date(feedback.triggeredAt) : null,
    uploadedFileName: feedback.uploadedFileName ?? null,
    uploadedAt: feedback.uploadedAt ? new Date(feedback.uploadedAt) : null,
    summary: feedback.summary ?? 'Feedback has not been uploaded yet.',
    responses: {
      create: (feedback.responses ?? []).map((response) =>
        toFeedbackResponseRecord(batch, response),
      ),
    },
  }
}

function toFeedbackResponseRecord(batch, response) {
  const participant = findFeedbackParticipant(batch, response)

  return {
    id: response.id,
    participantId: participant?.id ?? null,
    empId: response.empId ?? null,
    name: response.name ?? null,
    email: response.email ?? null,
    rating: response.rating ?? null,
    comments: response.comments ?? null,
    matched: response.matched ?? Boolean(participant),
    uploadedAt: response.uploadedAt ? new Date(response.uploadedAt) : new Date(),
  }
}

async function main() {
  await prisma.aiInsight.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.attendanceSession.deleteMany()
  await prisma.attendanceSummary.deleteMany()
  await prisma.feedbackResponse.deleteMany()
  await prisma.feedbackRun.deleteMany()
  await prisma.assessmentResult.deleteMany()
  await prisma.assessment.deleteMany()
  await prisma.log.deleteMany()
  await prisma.participant.deleteMany()
  await prisma.batch.deleteMany()
  await prisma.user.deleteMany()

  for (const user of demoUsers) {
    await prisma.user.create({ data: user })
  }

  const batchByCode = new Map()

  for (const batch of mockBatches) {
    const createdBatch = await prisma.batch.create({
      data: {
        batchCode: batch.batchId,
        trainingName: batch.trainingName,
        trainingType: batch.trainingType,
        startDate: parseDate(batch.startDate),
        endDate: parseDate(batch.endDate),
        scheduleType: batch.scheduleType ?? 'All Days',
        customDates: batch.customDates ?? null,
        timings: batch.timings,
        status: batch.status,
        assessmentScoreDeadline: batch.assessmentScoreDeadline
          ? new Date(batch.assessmentScoreDeadline)
          : null,
        trainerType: batch.trainerType ?? 'External',
        trainerName: batch.trainer?.name ?? null,
        trainerEmail: batch.trainer?.email ?? null,
        trainerEmpId: batch.trainerEmpId ?? null,
        trainerUnitOrCompetency:
          batch.trainerUnitOrCompetency ?? batch.trainer?.specialization ?? null,
        trainerPhone: batch.trainer?.phone ?? null,
        trainerSpecialization: batch.trainer?.specialization ?? null,
        meetingPlatform: batch.meetingPlatform ?? 'Teams',
        batchType:
          batch.batchType ??
          (batch.trainingType === 'Internal' ? 'Internal/Mavericks' : 'External/Segue'),
        coordinatorSpoc: batch.coordinatorSpoc ?? null,
        meetingLink: batch.meetingLink ?? null,
        participants: {
          create: batch.participants.map((participant) =>
            toParticipantRecord(batch, participant),
          ),
        },
        assessments: {
          create: (batch.assessments ?? []).map((assessment) =>
            toAssessmentRecord(batch, assessment),
          ),
        },
        feedbackRuns: batch.feedback
          ? {
              create: toFeedbackRunRecord(batch),
            }
          : undefined,
      },
    })

    batchByCode.set(batch.batchId, createdBatch)
  }

  for (const log of mockLogs) {
    const batch = batchByCode.get(log.batchId)

    await prisma.log.create({
      data: {
        id: log.id,
        batchId: batch?.id ?? null,
        batchCode: log.batchId,
        action: log.action,
        category: log.category,
        level: log.level,
        message: log.message,
        recipient: log.recipient ?? null,
        status: log.status,
        type: log.type,
        createdAt: new Date(log.createdAt),
      },
    })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
