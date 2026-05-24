import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test'
process.env.JWT_SECRET = 'test-secret'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.NODE_ENV = 'test'

const mockAzure = vi.hoisted(() => ({
  beginSend: vi.fn(),
}))

const mockPrisma = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  batch: {
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  participant: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  log: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  emailLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  systemSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  trainerProfile: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  placementOfficerMapping: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  assessment: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  assessmentEvidence: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  feedbackRun: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  feedbackResponse: {
    deleteMany: vi.fn(),
  },
  attendanceSession: {
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  attendanceSummary: {
    upsert: vi.fn(),
  },
  attendanceVersion: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  aiInsight: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('./db.js', () => ({ prisma: mockPrisma }))
vi.mock('@azure/communication-email', () => ({
  EmailClient: vi.fn(function EmailClient() {
    this.beginSend = mockAzure.beginSend
  }),
}))

const { createApp } = await import('./app.js')

const now = new Date('2026-05-09T10:00:00.000Z')
const demoUsers = {
  Admin: {
    id: 'user-admin',
    name: 'Mavericks Admin',
    email: 'admin@mavericks.demo',
    role: 'Admin',
  },
  Coordinator: {
    id: 'user-coordinator',
    name: 'Mavericks Coordinator',
    email: 'coordinator@mavericks.demo',
    role: 'Coordinator',
  },
  Trainer: {
    id: 'user-trainer',
    name: 'Avery Shah',
    email: 'trainer@mavericks.demo',
    role: 'Trainer',
  },
  Participant: {
    id: 'user-participant',
    name: 'Neha Rao',
    email: 'participant@mavericks.demo',
    role: 'Participant',
  },
}
const participants = [
  {
    id: 'p1',
    batchId: 'batch-db-id',
    participantType: 'Internal',
    empId: 'EMP-001',
    name: 'Asha Rao',
    email: 'asha@example.com',
    mobileNumber: null,
    isDiscontinued: false,
  },
  {
    id: 'p2',
    batchId: 'batch-db-id',
    participantType: 'Internal',
    empId: 'EMP-002',
    name: 'Dev Menon',
    email: 'dev@example.com',
    mobileNumber: null,
    isDiscontinued: false,
  },
]
const batch = {
  id: 'batch-db-id',
  batchCode: 'BATCH-001',
  trainingName: 'React Basics',
  trainingType: 'Internal',
  startDate: new Date('2026-05-01T00:00:00.000Z'),
  endDate: new Date('2026-05-05T00:00:00.000Z'),
  timings: '10:00 AM - 12:00 PM',
  status: 'Active',
  assessmentScoreDeadline: new Date('2026-05-09T12:00:00.000Z'),
  trainerName: 'Avery Shah',
  trainerEmail: 'trainer@example.com',
  scheduleType: 'All Days',
  customDates: '',
  trainerType: 'External',
  trainerEmpId: '',
  trainerUnitOrCompetency: 'React',
  trainerPhone: '',
  trainerSpecialization: 'React',
  meetingPlatform: 'Teams',
  batchType: 'Internal/Mavericks',
  coordinatorSpoc: 'Coordinator',
  meetingLink: '',
  participants,
  feedbackRuns: [],
}
const assessments = [
  {
    id: 'ASM-001',
    batchId: batch.id,
    name: 'Final Quiz',
    type: 'Quiz',
    date: new Date('2026-05-04T00:00:00.000Z'),
    cutoffScore: 70,
    maxScore: 100,
    weightage: 100,
    uploadedFileName: 'scores.csv',
    uploadedAt: now,
    createdAt: now,
    results: [
      {
        id: 'r1',
        assessmentId: 'ASM-001',
        participantId: 'p1',
        empId: 'EMP-001',
        name: 'Asha Rao',
        email: 'asha@example.com',
        scorePercent: 90,
        comments: '',
        cleared: true,
        uploadedAt: now,
      },
      {
        id: 'r2',
        assessmentId: 'ASM-001',
        participantId: 'p2',
        empId: 'EMP-002',
        name: 'Dev Menon',
        email: 'dev@example.com',
        scorePercent: 60,
        comments: '',
        cleared: false,
        uploadedAt: now,
      },
    ],
  },
]
const feedbackRun = {
  id: 'fb1',
  triggeredAt: now,
  uploadedAt: now,
  uploadedFileName: 'feedback.csv',
  summary: 'Average feedback rating is 4.5/5 from 2 responses.',
  responses: [],
}
const attendanceSessions = [
  {
    id: 'att1',
    batchId: batch.id,
    source: 'Teams',
    sessionDate: '2026-05-01',
    trainingName: 'React Basics',
    minimumDurationMinutes: 30,
    uploadedFileName: 'attendance.csv',
    uploadedAt: now,
    records: [
      {
        id: 'ar1',
        attendanceSessionId: 'att1',
        participantId: 'p1',
        sourceEmpId: 'EMP-001',
        sourceName: 'Asha Rao',
        sourceEmail: 'asha@example.com',
        durationMinutes: 60,
        matched: true,
        matchMethod: 'empId',
        reason: null,
      },
    ],
  },
]

function resetMocks() {
  vi.clearAllMocks()
  delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING
  delete process.env.AZURE_EMAIL_FROM_ADDRESS
  const insightStore = []
  mockAzure.beginSend.mockResolvedValue({
    pollUntilDone: vi.fn().mockResolvedValue({ id: 'azure-message-1' }),
  })

  mockPrisma.user.findFirst.mockImplementation(({ where }) => {
    if (where.email) {
      return Object.values(demoUsers).find((user) => user.email === where.email) ?? null
    }

    return demoUsers[where.role] ?? null
  })
  mockPrisma.user.findUnique.mockImplementation(({ where }) =>
    Object.values(demoUsers).find((user) => user.id === where.id) ?? null,
  )
  mockPrisma.batch.findMany.mockResolvedValue([batch])
  mockPrisma.batch.findUnique.mockImplementation(({ where, include }) => {
    if (where.batchCode !== batch.batchCode) return null
    if (!include) return batch

    return {
      ...batch,
      assessments,
      attendanceSessions,
      feedbackRuns: [feedbackRun],
      logs: [
        {
          id: 'log-report',
          batchId: batch.id,
          batchCode: batch.batchCode,
          action: 'consolidated_report_export',
          category: 'audit',
          level: 'INFO',
          message: 'Consolidated Report exported for React Basics.',
          recipient: 'Coordinator',
          status: 'Completed',
          type: 'Report',
          createdAt: now,
        },
      ],
      participants,
    }
  })
  mockPrisma.batch.create.mockImplementation(({ data }) => ({
    id: 'created-batch-db-id',
    ...data,
    participants: (data.participants?.create ?? []).map((participant) => ({
      ...participant,
      batchId: 'created-batch-db-id',
    })),
  }))
  mockPrisma.batch.update.mockImplementation(({ data }) => ({
    ...batch,
    ...data,
    updatedAt: now,
    participants,
  }))
  mockPrisma.log.create.mockImplementation(({ data }) => ({
    ...data,
    createdAt: data.createdAt ?? now,
  }))
  mockPrisma.notification.findMany.mockResolvedValue([])
  mockPrisma.notification.create.mockImplementation(({ data }) => ({
    id: 'notification-1',
    createdAt: now,
    ...data,
  }))
  mockPrisma.emailLog.findMany.mockResolvedValue([])
  mockPrisma.emailLog.create.mockImplementation(({ data }) => ({
    id: 'email-log-1',
    createdAt: now,
    ...data,
  }))
  mockPrisma.systemSetting.findUnique.mockResolvedValue(null)
  mockPrisma.systemSetting.upsert.mockImplementation(({ create, update }) => ({
    key: create?.key ?? 'admin-settings',
    value: update?.value ?? create?.value,
    createdAt: now,
    updatedAt: now,
  }))
  mockPrisma.trainerProfile.findMany.mockResolvedValue([])
  mockPrisma.trainerProfile.create.mockImplementation(({ data }) => ({
    ...data,
    createdAt: now,
    updatedAt: now,
  }))
  mockPrisma.trainerProfile.update.mockImplementation(({ data, where }) => ({
    id: where.id,
    name: 'Updated Trainer',
    email: 'updated@example.com',
    ...data,
    createdAt: now,
    updatedAt: now,
  }))
  mockPrisma.trainerProfile.upsert.mockImplementation(({ create, update }) => ({
    ...create,
    ...update,
    createdAt: now,
    updatedAt: now,
  }))
  mockPrisma.placementOfficerMapping.findMany.mockResolvedValue([])
  mockPrisma.placementOfficerMapping.upsert.mockImplementation(({ create, update }) => ({
    id: 'placement-1',
    ...create,
    ...update,
    createdAt: now,
    updatedAt: now,
  }))
  mockPrisma.assessment.findMany.mockResolvedValue(assessments)
  mockPrisma.assessment.findFirst.mockResolvedValue(assessments[0])
  mockPrisma.assessmentEvidence.create.mockImplementation(({ data }) => ({
    ...data,
    uploadedAt: data.uploadedAt ?? now,
  }))
  mockPrisma.feedbackRun.findFirst.mockResolvedValue(feedbackRun)
  mockPrisma.attendanceSession.findMany.mockResolvedValue(attendanceSessions)
  mockPrisma.attendanceSummary.upsert.mockResolvedValue({})
  mockPrisma.attendanceVersion.findMany.mockResolvedValue([])
  mockPrisma.attendanceVersion.create.mockImplementation(({ data }) => ({
    id: 'version-1',
    submittedAt: data.submittedAt ?? now,
    ...data,
  }))
  mockPrisma.aiInsight.findMany.mockImplementation(() => insightStore)
  mockPrisma.aiInsight.findUnique.mockImplementation(({ where }) => {
    const key = where.batchId_insightType_inputHash
    return insightStore.find(
      (insight) =>
        insight.batchId === key.batchId &&
        insight.insightType === key.insightType &&
        insight.inputHash === key.inputHash,
    ) ?? null
  })
  mockPrisma.aiInsight.create.mockImplementation(({ data }) => {
    const insight = {
      id: `insight-${insightStore.length + 1}`,
      generatedAt: now,
      ...data,
    }
    insightStore.push(insight)
    return insight
  })
}

async function login(role) {
  const response = await request(createApp())
    .post('/api/auth/demo-login')
    .send({ role })

  return response.body.data.token
}

describe('API hardening', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('returns health status', async () => {
    await request(createApp())
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ok: true,
          service: 'mavericks-execution-platform-api',
        })
      })
  })

  it('issues demo-login tokens and returns current user', async () => {
    const token = await login('admin')

    await request(createApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          email: 'admin@mavericks.demo',
          role: 'Admin',
        })
      })
  })

  it('returns 401 on protected writes without a token', async () => {
    await request(createApp())
      .post('/api/batches')
      .send({})
      .expect(401)
  })

  it('returns 403 when role is insufficient for a protected write', async () => {
    const token = await login('participant')

    await request(createApp())
      .post('/api/batches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: 'BATCH-NEW',
        trainingName: 'New Batch',
        trainingType: 'Internal',
        status: 'Active',
      })
      .expect(403)
  })

  it('reads batches publicly', async () => {
    await request(createApp())
      .get('/api/batches')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({
          batchId: 'BATCH-001',
          trainingName: 'React Basics',
          participants: expect.arrayContaining([
            expect.objectContaining({ empId: 'EMP-001' }),
          ]),
        })
      })
  })

  it('maps coordinator batch template fields and participant fields on create', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: 'BATCH-TEMPLATE-001',
        trainingName: 'Template Batch',
        trainingType: 'Segue',
        startDate: '2026-05-20',
        endDate: '2026-05-22',
        scheduleType: 'Custom Dates',
        customDates: '2026-05-20,2026-05-22',
        timings: '10:00 AM - 1:00 PM',
        status: 'Planned',
        trainerType: 'Hexavarsity',
        trainerName: 'Mira Thomas',
        trainerEmpId: 'TR-100',
        trainerUnitOrCompetency: 'Customer Success',
        meetingPlatform: 'Webex',
        batchType: 'External/Segue',
        participants: [
          {
            id: 'SUP-2001',
            name: 'Sam Wilson',
            email: 'sam@example.com',
            supersetId: 'SUP-2001',
            collegeName: 'Demo Institute',
            mobileNumber: '+91 90000 20001',
          },
        ],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          batchId: 'BATCH-TEMPLATE-001',
          scheduleType: 'Custom Dates',
          customDates: '2026-05-20,2026-05-22',
          trainerType: 'Hexavarsity',
          trainerEmpId: 'TR-100',
          trainerUnitOrCompetency: 'Customer Success',
          meetingPlatform: 'Webex',
          batchType: 'External/Segue',
          participants: [
            expect.objectContaining({
              supersetId: 'SUP-2001',
              collegeName: 'Demo Institute',
            }),
          ],
        })
      })

    expect(mockPrisma.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduleType: 'Custom Dates',
          trainerEmpId: 'TR-100',
          meetingPlatform: 'Webex',
          participants: expect.objectContaining({
            create: [
              expect.objectContaining({
                supersetId: 'SUP-2001',
                collegeName: 'Demo Institute',
              }),
            ],
          }),
        }),
      }),
    )
  })

  it('returns six-step lifecycle and close readiness', async () => {
    await request(createApp())
      .get('/api/batches/BATCH-001/lifecycle')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.steps).toHaveLength(6)
        expect(body.data).toMatchObject({
          attendanceStatus: 'Uploaded Late',
          assessmentScoreStatus: 'Uploaded Before Deadline',
          feedbackStatus: 'Summary Available',
          batchCloseReadiness: 'Ready To Close',
          canClose: true,
        })
      })
  })

  it('sets assessment score deadline', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .patch('/api/batches/BATCH-001/assessment-deadline')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentScoreDeadline: '2026-05-10T10:00:00.000Z' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.assessmentScoreDeadline).toBe('2026-05-10T10:00:00.000Z')
      })
  })

  it('generates reminder logs without sending email', async () => {
    const token = await login('trainer')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-05-01' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.message).toBe(
          'Attendance upload reminder sent to trainer for React Basics on 2026-05-01.',
        )
      })
  })

  it('persists system settings and trainer profiles through backend APIs', async () => {
    const adminToken = await login('admin')
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attendanceDeadlineTime: '09:45' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.attendanceDeadlineTime).toBe('09:45')
      })

    await request(createApp())
      .put('/api/trainer-profiles')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        trainers: [
          {
            id: 'TRN-999',
            name: 'Backend Trainer',
            email: 'backend.trainer@example.com',
            empId: 'TR-999',
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({
          id: 'TRN-999',
          email: 'backend.trainer@example.com',
        })
      })
  })

  it('creates mock email notification and evaluates notification rules', async () => {
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/notifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        batchId: 'BATCH-001',
        event: 'participant_not_onboarded',
        type: 'Onboarding',
        recipients: ['po@example.com'],
        message: 'Participant onboarding is pending.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          event: 'participant_not_onboarded',
          channel: 'Email',
          status: 'Mock Sent',
        })
      })

    await request(createApp())
      .post('/api/batches/BATCH-001/notifications/evaluate')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ source: 'Teams' })
      .expect(201)

    expect(mockPrisma.emailLog.create).toHaveBeenCalled()
  })

  it('sends test email through mock fallback when Azure env vars are missing', async () => {
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'person@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'mock',
          status: 'Mock Sent',
          recipients: ['person@example.com'],
          messageId: '',
        })
      })

    expect(mockAzure.beginSend).not.toHaveBeenCalled()
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'Email',
          event: 'test_email',
          provider: 'Mock',
          status: 'Mock Sent',
          to: ['person@example.com'],
        }),
      }),
    )
  })

  it('uses Azure EmailClient when Azure env vars are configured', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = 'DoNotReply@example.com'
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'person@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'azure',
          status: 'Sent',
          recipients: ['person@example.com'],
          messageId: 'azure-message-1',
        })
      })

    expect(mockAzure.beginSend).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: 'DoNotReply@example.com',
        recipients: {
          to: [{ address: 'person@example.com' }],
        },
        content: expect.objectContaining({
          subject: 'Mavericks Platform Test Email',
        }),
      }),
    )
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'Azure',
          status: 'Sent',
          messageId: 'azure-message-1',
        }),
      }),
    )
  })

  it('logs failed Azure sends without exposing secrets or crashing', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=secret-value'
    process.env.AZURE_EMAIL_FROM_ADDRESS = 'DoNotReply@example.com'
    mockAzure.beginSend.mockRejectedValueOnce(new Error('Azure rejected send'))
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'person@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'azure',
          status: 'Failed',
          recipients: ['person@example.com'],
          error: 'Azure rejected send',
        })
        expect(JSON.stringify(body)).not.toContain('secret-value')
      })
  })

  it('allows coordinators to close ready batches and rejects trainer close', async () => {
    const coordinatorToken = await login('coordinator')
    const trainerToken = await login('trainer')

    await request(createApp())
      .patch('/api/batches/BATCH-001/close')
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(403)

    await request(createApp())
      .patch('/api/batches/BATCH-001/close')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe('Closed')
      })
  })

  it('returns assessment stats and toppers', async () => {
    await request(createApp())
      .get('/api/batches/BATCH-001/assessments/stats')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          totalParticipants: 2,
          assessed: 2,
          cleared: 1,
          notCleared: 1,
          clearanceRate: 50,
        })
      })

    await request(createApp())
      .get('/api/batches/BATCH-001/assessments/toppers')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({
          participantId: 'p1',
          finalScore: 90,
        })
      })
  })

  it('returns feedback summary', async () => {
    await request(createApp())
      .get('/api/batches/BATCH-001/feedback/summary')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.summary).toContain('Average feedback rating')
      })
  })

  it('returns attendance report data', async () => {
    await request(createApp())
      .get('/api/batches/BATCH-001/attendance/report')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          dates: ['2026-05-01'],
          source: 'Teams',
          summary: {
            totalParticipants: 2,
            attended: 1,
            notAttended: 1,
          },
        })
      })
  })

  it('caches deterministic insights by input hash', async () => {
    const token = await login('admin')
    const first = await request(createApp())
      .post('/api/batches/BATCH-001/insights/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ insightType: 'attendance_summary' })
      .expect(201)

    const second = await request(createApp())
      .post('/api/batches/BATCH-001/insights/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ insightType: 'attendance_summary' })
      .expect(200)

    expect(second.body.data).toMatchObject({
      id: first.body.data.id,
      inputHash: first.body.data.inputHash,
      cached: true,
      provider: 'deterministic',
      model: 'rule-based-v1',
    })
    expect(mockPrisma.aiInsight.create).toHaveBeenCalledTimes(1)
  })
})
