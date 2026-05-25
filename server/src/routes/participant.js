import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'

export const participantRouter = Router()

const participantAccess = [requireAuth, requireRole('Participant')]

function dateValue(value) {
  return value?.toISOString?.().slice(0, 10) ?? value ?? ''
}

function participantDashboardBatch(batch, participant) {
  const sessions = [...(batch.attendanceSessions ?? [])].sort((left, right) =>
    String(left.sessionDate).localeCompare(String(right.sessionDate)),
  )
  const attendanceHistory = sessions.map((session) => {
    const record = (session.records ?? []).find((item) => item.participantId === participant.id)

    return {
      date: session.sessionDate,
      status: record ? 'Present' : 'Absent',
      durationMinutes: record?.durationMinutes ?? 0,
    }
  })
  const attended = attendanceHistory.filter((entry) => entry.status === 'Present').length
  const today = new Date().toISOString().slice(0, 10)
  const todayAttendance = attendanceHistory.find((entry) => entry.date === today)?.status ?? 'Not marked'

  return {
    id: batch.batchCode,
    trainingName: batch.trainingName,
    trainerName: batch.trainerName ?? '',
    startDate: dateValue(batch.startDate),
    endDate: dateValue(batch.endDate),
    timings: batch.timings ?? '',
    todayAttendance,
    attendancePercentage: attendanceHistory.length
      ? Math.round((attended / attendanceHistory.length) * 100)
      : null,
    attendanceHistory,
    upcomingAssessments: (batch.assessments ?? [])
      .filter((assessment) => !assessment.date || dateValue(assessment.date) >= today)
      .map((assessment) => ({
        id: assessment.id,
        name: assessment.name,
        date: dateValue(assessment.date),
        type: assessment.type,
      })),
  }
}

participantRouter.get('/participant/dashboard', participantAccess, async (request, response, next) => {
  try {
    const batches = await prisma.batch.findMany({
      where: {
        participants: {
          some: {
            email: {
              equals: request.user.email,
              mode: 'insensitive',
            },
          },
        },
      },
      include: {
        participants: true,
        assessments: true,
        attendanceSessions: {
          include: { records: true },
          orderBy: { sessionDate: 'asc' },
        },
      },
      orderBy: [{ startDate: 'desc' }, { batchCode: 'asc' }],
    })

    const assignments = batches.flatMap((batch) => {
      const participant = (batch.participants ?? []).find(
        (entry) => entry.email?.toLowerCase() === request.user.email?.toLowerCase(),
      )

      return participant ? [participantDashboardBatch(batch, participant)] : []
    })

    response.json({
      data: {
        participantName: request.user.name ?? '',
        assignments,
      },
    })
  } catch (error) {
    next(error)
  }
})
