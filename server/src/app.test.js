import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test'
process.env.JWT_SECRET = 'test-secret'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.NODE_ENV = 'test'
process.env.ENABLE_DEMO_AUTH = 'true'

const mockAzure = vi.hoisted(() => ({
  beginSend: vi.fn(),
}))

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  user: {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
    findFirst: vi.fn(),
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
    upsert: vi.fn(),
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
    upsert: vi.fn(),
  },
}))

vi.mock('./db.js', () => ({ prisma: mockPrisma }))
vi.mock('@azure/communication-email', () => ({
  EmailClient: vi.fn(function EmailClient() {
    this.beginSend = mockAzure.beginSend
  }),
}))

const { createApp } = await import('./app.js')
const { ConfigError, loadConfig } = await import('./config.js')
const { signSessionToken } = await import('./auth.js')
const { resetEmailQueueForTests } = await import('./utils/emailQueue.js')

const now = new Date('2026-05-09T10:00:00.000Z')
const schedulerNow = new Date('2026-05-09T12:00:00.000Z')
const verifiedAzureSender = 'DoNotReply@87c3b3a6-ea7f-4758-a4e2-b1d2aaf25472.azurecomm.net'
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
}
const participantUser = {
  id: 'user-participant',
  name: 'Neha Rao',
  email: 'participant@example.com',
  role: 'Participant',
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
  assessmentDates: '',
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

function makeSchedulerBatch(overrides = {}) {
  return {
    ...batch,
    status: 'Running',
    startDate: new Date('2026-05-09T00:00:00.000Z'),
    endDate: new Date('2026-05-09T00:00:00.000Z'),
    timings: '09:00 AM - 10:00 AM',
    coordinatorSpoc: 'coordinator@example.com',
    attendanceSessions: [],
    participants: [
      {
        ...participants[0],
        email: 'asha@example.com',
        placementOfficerEmail: 'po@example.com',
        isOnboarded: false,
        onboardingStatus: 'Pending',
      },
    ],
    assessments: [],
    ...overrides,
  }
}

function resetMocks() {
  vi.clearAllMocks()
  delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING
  delete process.env.AZURE_EMAIL_FROM_ADDRESS
  delete process.env.AZURE_EMAIL_QUEUE_DELAY_MS
  delete process.env.AZURE_EMAIL_RETRY_DELAYS_MS
  delete process.env.SCHEDULER_SECRET
  delete process.env.AI_DECISION_ENABLED
  delete process.env.AI_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_MODEL
  delete process.env.AI_DECISION_MAX_TOKENS
  delete process.env.AI_DECISION_TIMEOUT_MS
  resetEmailQueueForTests()
  const insightStore = []
  mockAzure.beginSend.mockResolvedValue({
    pollUntilDone: vi.fn().mockResolvedValue({ id: 'azure-message-1' }),
  })

  mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])

  mockPrisma.user.findFirst.mockImplementation(({ where }) => {
    if (where.email) {
      return Object.values(demoUsers).find((user) => user.email === where.email) ?? null
    }

    return demoUsers[where.role] ?? null
  })
  mockPrisma.user.findUnique.mockImplementation(({ where }) =>
    [...Object.values(demoUsers), participantUser].find((user) => user.id === where.id) ?? null,
  )
  mockPrisma.user.findMany.mockResolvedValue(
    Object.values(demoUsers),
  )
  mockPrisma.user.count.mockResolvedValue(1)
  mockPrisma.user.create.mockImplementation(({ data }) => ({
    id: 'user-created',
    ...data,
  }))
  mockPrisma.user.update.mockImplementation(({ where, data }) => ({
    ...([...Object.values(demoUsers), participantUser].find((user) => user.id === where.id) ?? { id: where.id }),
    ...data,
  }))
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
  mockPrisma.participant.create.mockImplementation(({ data }) => ({
    ...data,
  }))
  mockPrisma.participant.update.mockImplementation(({ where, data }) => ({
    ...(participants.find((participant) => participant.id === where.id) ?? { id: where.id, batchId: batch.id }),
    ...data,
  }))
  mockPrisma.log.create.mockImplementation(({ data }) => ({
    ...data,
    createdAt: data.createdAt ?? now,
  }))
  mockPrisma.notification.findMany.mockResolvedValue([])
  mockPrisma.notification.findFirst.mockResolvedValue(null)
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
  mockPrisma.assessment.update.mockImplementation(({ data }) => ({
    ...assessments[0],
    ...data,
    results: [...assessments[0].results, ...(data.results?.create ?? [])],
  }))
  mockPrisma.assessmentEvidence.create.mockImplementation(({ data }) => ({
    ...data,
    uploadedAt: data.uploadedAt ?? now,
  }))
  mockPrisma.feedbackRun.findFirst.mockResolvedValue(feedbackRun)
  mockPrisma.feedbackRun.update.mockImplementation(({ data }) => ({
    ...feedbackRun,
    ...data,
    responses: feedbackRun.responses,
  }))
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
  mockPrisma.aiInsight.upsert.mockImplementation(({ where, update, create }) => {
    const key = where.batchId_insightType_inputHash
    const existing = insightStore.find(
      (insight) =>
        insight.batchId === key.batchId &&
        insight.insightType === key.insightType &&
        insight.inputHash === key.inputHash,
    )
    if (existing) {
      Object.assign(existing, update)
      return existing
    }
    const insight = {
      id: `insight-${insightStore.length + 1}`,
      generatedAt: now,
      ...create,
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

function participantSessionToken() {
  return signSessionToken(participantUser)
}

describe('API hardening', () => {
  beforeEach(() => {
    resetMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns health status', async () => {
    await request(createApp())
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ok: true,
          service: 'mavericks-execution-platform-api',
          db: 'connected',
          emailProvider: 'mock',
          schedulerConfigured: false,
        })
      })
  })

  it('requires Azure email and scheduler settings in production config', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
        JWT_SECRET: 'test-secret',
        PORT: '4000',
      }),
    ).toThrow(ConfigError)
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

  it('does not offer participant as a demo-login role', async () => {
    await request(createApp())
      .post('/api/auth/demo-login')
      .send({ role: 'participant' })
      .expect(404)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Demo role not available.',
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
    const token = participantSessionToken()

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

  it('requires staff authentication to read batches', async () => {
    await request(createApp())
      .get('/api/batches')
      .expect(401)

    const token = await login('coordinator')

    await request(createApp())
      .get('/api/batches')
      .set('Authorization', `Bearer ${token}`)
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
            placementOfficerEmail: 'placements@demo.example',
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
              placementOfficerEmail: 'placements@demo.example',
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
                placementOfficerEmail: 'placements@demo.example',
              }),
            ],
          }),
        }),
      }),
    )
  })

  it('does not require placement officer email for internal participants', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/participants')
      .set('Authorization', `Bearer ${token}`)
      .send({ empId: 'EMP-003', empName: 'Meera Singh', officialEmail: 'meera@example.com' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          empId: 'EMP-003',
          empName: 'Meera Singh',
          officialEmail: 'meera@example.com',
        })
      })
  })

  it('uploads new internal participants and reports created rows', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({ ...batch, participants: [] })

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [{
          rowNumber: 2,
          participant: { empId: 'EMP-101', empName: 'New Learner', officialEmail: '' },
        }],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 1, updated: 0, skipped: 0, errors: [] })
        expect(body.data.participants[0]).toMatchObject({ empId: 'EMP-101', empName: 'New Learner' })
      })
  })

  it('re-uploads an existing internal participant as an update instead of a conflict', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({ ...batch, participants: [participants[0]] })

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [{
          rowNumber: 2,
          participant: { empId: 'EMP-001', empName: 'Asha Updated', officialEmail: 'updated.asha@example.com' },
        }],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, updated: 1 })
        expect(body.data.participants[0]).toMatchObject({ empId: 'EMP-001', empName: 'Asha Updated' })
      })

    expect(mockPrisma.participant.update).toHaveBeenCalled()
    expect(mockPrisma.participant.create).not.toHaveBeenCalled()
  })

  it('rejects duplicate identifiers within one participant upload with row details', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({ ...batch, participants: [] })

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { rowNumber: 2, participant: { empId: 'EMP-DUP', empName: 'First' } },
          { rowNumber: 3, participant: { empId: 'EMP-DUP', empName: 'Second' } },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.message).toBe('Participant upload contains validation errors.')
        expect(body.error.details[0]).toMatchObject({ rowNumber: 3, identifier: 'EMP-DUP' })
        expect(body.error.details[0].messages[0]).toContain('Duplicate Emp ID')
      })

    expect(mockPrisma.participant.create).not.toHaveBeenCalled()
  })

  it('uploads and re-uploads External/Segue participants using Superset ID', async () => {
    const token = await login('coordinator')
    const externalBatch = {
      ...batch,
      trainingType: 'Segue',
      batchType: 'External/Segue',
      participants: [],
    }
    const uploaded = {
      supersetId: 'SUP-101',
      name: 'External Learner',
      email: 'external@example.com',
      collegeName: 'Demo College',
      mobileNumber: '9000012345',
      placementOfficerEmail: 'placements@example.com',
    }
    mockPrisma.batch.findUnique.mockResolvedValueOnce(externalBatch)

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ rowNumber: 2, participant: uploaded }] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 1, updated: 0 })
        expect(body.data.participants[0]).toMatchObject({ supersetId: 'SUP-101', email: 'external@example.com' })
      })

    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...externalBatch,
      participants: [{ id: 'external-db-id', batchId: batch.id, participantType: 'External', ...uploaded }],
    })
    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ rowNumber: 2, participant: { ...uploaded, mobileNumber: '9888812345' } }] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, updated: 1 })
        expect(body.data.participants[0].mobileNumber).toBe('9888812345')
      })
  })

  it('rejects invalid External participant upload rows and disallows non-coordinator upload', async () => {
    const coordinatorToken = await login('coordinator')
    const trainerToken = await login('trainer')
    const externalBatch = { ...batch, trainingType: 'Segue', batchType: 'External/Segue', participants: [] }
    mockPrisma.batch.findUnique.mockResolvedValueOnce(externalBatch)

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ rows: [{ rowNumber: 4, participant: { supersetId: 'SUP-ERR', name: 'Missing Fields' } }] })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.details[0].rowNumber).toBe(4)
        expect(body.error.details[0].messages[0]).toContain('Emp Email')
      })

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ rows: [{ participant: { empId: 'EMP-X', empName: 'Denied' } }] })
      .expect(403)

    await request(createApp())
      .post('/api/batches/BATCH-001/participants/upload')
      .set('Authorization', `Bearer ${participantSessionToken()}`)
      .send({ rows: [{ participant: { empId: 'EMP-X', empName: 'Denied' } }] })
      .expect(403)
  })

  it('allows coordinators to edit closed batches and persist full editable fields', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({ ...batch, status: 'Closed' })

    await request(createApp())
      .put('/api/batches/BATCH-001')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: 'BATCH-RENAMED',
        trainingName: 'Updated Execution Lab',
        trainingType: 'Segue',
        batchType: 'External/Segue',
        startDate: '2026-05-20',
        endDate: '2026-05-22',
        scheduleType: 'Custom Dates',
        customDates: '2026-05-20,2026-05-22',
        assessmentDates: '2026-05-21',
        timings: '09:00 AM - 12:00 PM',
        status: 'Closed',
        trainerType: 'External',
        trainerName: 'Updated Trainer',
        trainerEmail: 'updated.trainer@example.com',
        assignedTrainers: [{ name: 'Updated Trainer', email: 'updated.trainer@example.com' }],
        meetingPlatform: 'Webex',
        coordinatorSpoc: 'updated.coordinator@example.com',
        meetingLink: 'https://meeting.example/updated',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          batchId: 'BATCH-RENAMED',
          trainingName: 'Updated Execution Lab',
          batchType: 'External/Segue',
          assessmentDates: '2026-05-21',
          status: 'Closed',
          coordinatorSpoc: 'updated.coordinator@example.com',
        })
      })

    expect(mockPrisma.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchCode: 'BATCH-RENAMED',
          assessmentDates: '2026-05-21',
          assignedTrainers: [{ name: 'Updated Trainer', email: 'updated.trainer@example.com' }],
        }),
      }),
    )
  })

  it('returns six-step lifecycle and close readiness', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .get('/api/batches/BATCH-001/lifecycle')
      .set('Authorization', `Bearer ${token}`)
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

  it('sends attendance reminders from coordinator to assigned trainer with persisted email logs', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-05-01' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          recipients: ['trainer@example.com'],
          deliveryStatus: 'Mock Sent',
        })
      })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'attendance_upload_reminder',
          recipients: ['trainer@example.com'],
        }),
      }),
    )
    expect(mockPrisma.emailLog.create).toHaveBeenCalled()
  })

  it('sends assessment reminders to batch participants with delivery results', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment')
      .set('Authorization', `Bearer ${token}`)
      .send({ dueDate: '2026-05-10' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 2, failed: 0, skipped: 0 })
        expect(body.data.recipients).toEqual([
          expect.objectContaining({ name: 'Asha Rao', email: 'asha@example.com', status: 'Sent' }),
          expect.objectContaining({ name: 'Dev Menon', email: 'dev@example.com', status: 'Sent' }),
        ])
      })

    const requests = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'assessment_reminder', recipients: ['asha@example.com'] }),
      expect.objectContaining({ event: 'assessment_reminder', recipients: ['dev@example.com'] }),
    ]))
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'assessment_reminder',
          to: ['asha@example.com'],
          status: 'Mock Sent',
          metadata: expect.objectContaining({ generatedBy: 'fallback' }),
        }),
      }),
    )
  })

  it('sends lifecycle assessment score upload reminders to assigned trainers, not participants', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      assignedTrainers: [
        { name: 'Avery Shah', email: 'trainer@example.com' },
        { name: 'Mina Das', email: 'mina.trainer@example.com' },
      ],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment-score-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz', dueDate: '2026-05-10' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 2, failed: 0, skipped: 0 })
        expect(body.data.recipients).toEqual(expect.arrayContaining([
          expect.objectContaining({ trainerName: 'Avery Shah', email: 'trainer@example.com', status: 'Sent' }),
          expect.objectContaining({ trainerName: 'Mina Das', email: 'mina.trainer@example.com', status: 'Sent' }),
        ]))
      })

    const requests = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(requests).toHaveLength(2)
    expect(requests.every((entry) => entry.event === 'assessment_score_upload_reminder')).toBe(true)
    expect(requests.some((entry) => entry.recipients.includes('asha@example.com'))).toBe(false)
  })

  it('returns sent for a trainer score upload reminder when Azure Email succeeds', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment-score-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz', dueDate: '2026-05-10' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
        expect(body.data.recipients[0]).toMatchObject({
          trainerName: 'Avery Shah',
          email: 'trainer@example.com',
          status: 'Sent',
          provider: 'Azure',
          messageId: 'azure-message-1',
        })
      })

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'assessment_score_upload_reminder',
          status: 'Sent',
          provider: 'Azure',
          messageId: 'azure-message-1',
          metadata: expect.objectContaining({
            event: 'assessment_score_upload_reminder',
            recipientType: 'trainer',
            provider: 'Azure',
            status: 'Sent',
            messageId: 'azure-message-1',
          }),
        }),
      }),
    )
  })

  it('reports sent when trainer score reminder uses AI fallback but Azure delivery succeeds', async () => {
    process.env.AI_EMAIL_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment-score-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz', dueDate: '2026-05-10' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
        expect(body.data.recipients[0]).toMatchObject({
          status: 'Sent',
          provider: 'Azure',
          generatedBy: 'fallback',
        })
      })

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'Sent',
          provider: 'Azure',
          metadata: expect.objectContaining({
            generatedBy: 'fallback',
            aiFallbackReason: 'rate_limited',
            status: 'Sent',
          }),
        }),
      }),
    )
  })

  it('returns a clean temporary-unavailable trainer reminder status while retaining Azure diagnostics in logs', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    process.env.AZURE_EMAIL_RETRY_DELAYS_MS = '0,0,0'
    mockAzure.beginSend.mockRejectedValue(Object.assign(new Error('Please try again after 0 seconds'), {
      code: 'TooManyRequests',
      statusCode: 429,
      retryAfter: 0,
      requestId: 'throttle-request-1',
    }))
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment-score-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 0, failed: 1, skipped: 0 })
        expect(body.data.recipients[0]).toMatchObject({
          status: 'Failed',
          deliveryState: 'temporarily_unavailable',
          reason: 'Temporarily unavailable. Please try again later.',
        })
        expect(body.data.recipients[0]).not.toHaveProperty('providerCode')
        expect(body.data.recipients[0]).not.toHaveProperty('providerMessage')
      })

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            providerCode: 'TooManyRequests',
            requestId: 'throttle-request-1',
            retryCount: 3,
          }),
        }),
      }),
    )
  })

  it('skips lifecycle assessment score upload reminder when no trainer email is assigned', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      assignedTrainers: [],
      trainerEmail: '',
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment-score-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 0, failed: 0, skipped: 1 })
        expect(body.data.recipients[0]).toMatchObject({ status: 'Skipped', reason: 'No trainer email is assigned to this batch.' })
      })

    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'assessment_score_upload_reminder', status: 'Skipped' }) }),
    )
  })

  it('records a skipped assessment reminder when an internal participant email is missing', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      participants: [{ ...participants[0], email: '', officialEmail: '', empEmail: '' }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentId: 'ASM-001', assessmentName: 'Final Quiz' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 0, failed: 0, skipped: 1 })
        expect(body.data.recipients).toEqual([
          expect.objectContaining({ name: 'Asha Rao', email: '', status: 'Skipped', reason: 'Missing email' }),
        ])
      })

    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'assessment_reminder',
          status: 'Skipped',
          provider: 'Not Sent',
          error: 'Missing email',
        }),
      }),
    )
  })

  it('uses an Internal/Mavericks officialEmail alias for assessment reminder delivery', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      participants: [{
        ...participants[0],
        email: '',
        officialEmail: 'asha.official@example.com',
      }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentName: 'Final Quiz' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
        expect(body.data.recipients[0]).toMatchObject({
          email: 'asha.official@example.com',
          status: 'Sent',
        })
      })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipients: ['asha.official@example.com'] }),
      }),
    )
  })

  it('sends an External/Segue assessment reminder using participant empEmail through Azure', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      trainingType: 'Segue',
      batchType: 'External/Segue',
      participants: [{
        id: 'external-1',
        name: 'Riya Das',
        empEmail: 'riya@example.com',
        email: '',
      }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentId: 'ASM-EXT', assessmentName: 'External Assessment' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
        expect(body.data.recipients).toEqual([
          expect.objectContaining({ name: 'Riya Das', email: 'riya@example.com', status: 'Sent', provider: 'azure' }),
        ])
      })

    expect(mockAzure.beginSend).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.objectContaining({
          to: [{ address: 'riya@example.com' }],
        }),
      }),
    )
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'assessment_reminder',
          to: ['riya@example.com'],
          status: 'Sent',
          provider: 'Azure',
        }),
      }),
    )
  })

  it('falls back once for an OpenAI rate limit during assessment reminder fan-out', async () => {
    process.env.AI_EMAIL_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    vi.stubGlobal('fetch', fetchImpl)
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/assessment')
      .set('Authorization', `Bearer ${token}`)
      .send({ assessmentId: 'ASM-001', assessmentName: 'Final Quiz', dueDate: '2026-05-10' })
      .expect(201)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const requests = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(requests[0].metadata).toMatchObject({
      assessmentId: 'ASM-001',
      assessmentName: 'Final Quiz',
      aiFallbackReason: 'rate_limited',
    })
    expect(requests[1].metadata).toMatchObject({
      assessmentId: 'ASM-001',
      assessmentName: 'Final Quiz',
      aiFallbackReason: 'rate_limit_batch_fallback',
    })
  })

  it('does not allow trainers to send attendance reminders', async () => {
    const token = await login('trainer')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-05-01' })
      .expect(403)
  })

  it('warns and skips attendance reminder delivery when no trainer email is assigned', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      trainerEmail: '',
      assignedTrainers: [],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-05-01' })
      .expect(400)

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'attendance_upload_reminder', status: 'Skipped', provider: 'Not Sent' }),
      }),
    )
    expect(mockPrisma.log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'attendance_reminder_skipped', status: 'Skipped' }),
      }),
    )
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
          status: 'Pending',
        })
      })

    await request(createApp())
      .post('/api/batches/BATCH-001/notifications/evaluate')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ source: 'Teams' })
      .expect(201)

    expect(mockPrisma.emailLog.create).toHaveBeenCalled()
  })

  it('records invalid non-email recipients as skipped rather than sending them', async () => {
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/notifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        batchId: 'BATCH-001',
        event: 'manual_delivery_check',
        recipients: ['Training Coordinator'],
        message: 'Recipient validation check.',
      })
      .expect(201)

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: [],
          provider: 'Not Sent',
          status: 'Skipped',
          error: 'No valid recipient email address is configured.',
        }),
      }),
    )
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
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
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
        senderAddress: verifiedAzureSender,
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
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    mockAzure.beginSend.mockRejectedValueOnce(Object.assign(new Error('Azure rejected send'), {
      code: 'EmailSendRejected',
      statusCode: 400,
      requestId: 'request-failed-1',
    }))
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
          providerStatusCode: 400,
          providerCode: 'EmailSendRejected',
          providerMessage: 'Azure rejected send',
          requestId: 'request-failed-1',
        })
        expect(JSON.stringify(body)).not.toContain('secret-value')
      })

    expect(mockAzure.beginSend).toHaveBeenCalledTimes(1)
  })

  it('allows a coordinator to send one Azure Email diagnostic and returns its message ID', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/notifications/email-diagnostics')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ to: 'diagnostics@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'Azure',
          status: 'Sent',
          recipients: ['diagnostics@example.com'],
          messageId: 'azure-message-1',
        })
      })

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'email_diagnostics',
          provider: 'Azure',
          status: 'Sent',
          messageId: 'azure-message-1',
        }),
      }),
    )
  })

  it('reports an invalid Azure Email sender before invoking the provider', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = 'DoNotReply@example.com'
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/email-diagnostics')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'diagnostics@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'Azure',
          status: 'Failed',
          providerCode: 'InvalidSenderAddress',
        })
        expect(body.data.providerMessage).toContain(verifiedAzureSender)
      })

    expect(mockAzure.beginSend).not.toHaveBeenCalled()
  })

  it('returns a friendly Azure Email diagnostic when retry-after is zero', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    process.env.AZURE_EMAIL_RETRY_DELAYS_MS = '0,0,0'
    mockAzure.beginSend.mockRejectedValue(Object.assign(new Error('Please try again after 0 seconds'), {
      code: 'TooManyRequests',
      statusCode: 429,
      retryAfter: 0,
    }))
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/email-diagnostics')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'diagnostics@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          provider: 'Azure',
          status: 'Failed',
          providerStatusCode: 429,
          providerCode: 'TooManyRequests',
          retryAfterSeconds: 0,
          providerMessage: 'Azure Email temporarily rejected the request. Please retry after a few minutes.',
          deliveryState: 'temporarily_unavailable',
          retryCount: 3,
        })
      })

    expect(mockAzure.beginSend).toHaveBeenCalledTimes(4)
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            providerCode: 'TooManyRequests',
            deliveryState: 'temporarily_unavailable',
            retryCount: 3,
          }),
        }),
      }),
    )
  })

  it('retries a transient Azure throttle response and reports sent after recovery', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    process.env.AZURE_EMAIL_RETRY_DELAYS_MS = '0,0,0'
    mockAzure.beginSend
      .mockRejectedValueOnce(Object.assign(new Error('Too many requests'), {
        code: 'TooManyRequests',
        statusCode: 429,
      }))
      .mockResolvedValueOnce({
        pollUntilDone: vi.fn().mockResolvedValue({ id: 'azure-recovered-message' }),
      })
    const adminToken = await login('admin')

    await request(createApp())
      .post('/api/notifications/email-diagnostics')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'diagnostics@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          status: 'Sent',
          deliveryState: 'sent',
          messageId: 'azure-recovered-message',
          retryCount: 1,
        })
      })

    expect(mockAzure.beginSend).toHaveBeenCalledTimes(2)
  })

  it('rejects scheduler jobs with missing or invalid scheduler secret', async () => {
    process.env.SCHEDULER_SECRET = 'scheduler-secret'

    await request(createApp())
      .post('/api/notifications/run/attendance-cutoff')
      .expect(401)

    await request(createApp())
      .post('/api/notifications/run/attendance-cutoff')
      .set('x-scheduler-secret', 'wrong-secret')
      .expect(401)
  })

  it('runs attendance cutoff scheduler job with a valid scheduler secret', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(schedulerNow)
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'admin-settings',
      value: { attendanceDeadlineTime: '00:00', attendanceGraceMinutes: 20 },
    })
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({ attendanceSessions: [] }),
    ])

    await request(createApp())
      .post('/api/notifications/run/attendance-cutoff')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          event: 'attendance_not_uploaded_before_cutoff',
          processed: 1,
          sent: 1,
          skipped: 0,
          failed: 0,
        })
      })

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'attendance_not_uploaded_before_cutoff',
          eventDate: expect.any(String),
          recipients: ['coordinator@example.com'],
        }),
      }),
    )
    expect(mockPrisma.emailLog.create).toHaveBeenCalled()
  })

  it('skips duplicate scheduler notifications by event, batch, participant, and date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(schedulerNow)
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'admin-settings',
      value: { attendanceDeadlineTime: '00:00', attendanceGraceMinutes: 20 },
    })
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({ attendanceSessions: [] }),
    ])
    mockPrisma.notification.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-notification' })

    await request(createApp())
      .post('/api/notifications/run/attendance-cutoff')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          processed: 1,
          sent: 1,
          skipped: 0,
          failed: 0,
        })
      })

    await request(createApp())
      .post('/api/notifications/run/attendance-cutoff')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          processed: 1,
          sent: 0,
          skipped: 1,
          failed: 0,
        })
      })

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.emailLog.create).toHaveBeenCalledTimes(1)
  })

  it('sends External/Segue two-day absence escalation to participant with placement officer CC', async () => {
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({
        trainingType: 'Segue',
        batchType: 'External/Segue',
        attendanceSessions: [
          { sessionDate: '2026-05-08', records: [] },
          { sessionDate: '2026-05-09', records: [] },
        ],
      }),
    ])

    await request(createApp())
      .post('/api/notifications/run/consecutive-absence')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        event: 'external_consecutive_absence_2_days',
        recipients: ['asha@example.com'],
      }) }),
    )
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        event: 'external_consecutive_absence_2_days',
        to: ['asha@example.com'],
        cc: ['po@example.com'],
      }) }),
    )
  })

  it('deduplicates External/Segue two-day absence escalation on the same day', async () => {
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({
        trainingType: 'Segue',
        batchType: 'External/Segue',
        attendanceSessions: [
          { sessionDate: '2026-05-08', records: [] },
          { sessionDate: '2026-05-09', records: [] },
        ],
      }),
    ])
    mockPrisma.notification.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'already-sent' })

    await request(createApp()).post('/api/notifications/run/consecutive-absence').set('x-scheduler-secret', 'scheduler-secret').expect(200)
    await request(createApp()).post('/api/notifications/run/consecutive-absence').set('x-scheduler-secret', 'scheduler-secret').expect(200)

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.emailLog.create).toHaveBeenCalledTimes(1)
  })

  it('records OpenAI-generated email origin when AI email and Azure delivery are configured', async () => {
    process.env.AI_EMAIL_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=https://example.communication.azure.com/;accesskey=test-key'
    process.env.AZURE_EMAIL_FROM_ADDRESS = verifiedAzureSender
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          subject: 'AI attendance reminder',
          html: '<p>AI attendance reminder.</p>',
          text: 'AI attendance reminder.',
        }),
      }),
    }))
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/reminders/attendance')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ date: '2026-05-01' })
      .expect(201)

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'Azure',
          status: 'Sent',
          metadata: expect.objectContaining({ generatedBy: 'openai', aiProvider: 'openai' }),
        }),
      }),
    )
  })

  it('allows staff owners to test saved trainer, feedback, and placement email routes', async () => {
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/notifications/test-trainer-reminder')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ batchId: 'BATCH-001' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ recipients: ['trainer@example.com'], generatedBy: 'fallback' })
      })

    await request(createApp())
      .post('/api/notifications/test-feedback-email')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ batchId: 'BATCH-001', participantIds: ['p1'] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.recipients).toEqual(['asha@example.com'])
      })

    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      batchType: 'External/Segue',
      participants: [{ ...participants[0], placementOfficerEmail: 'po@example.com' }],
    })
    await request(createApp())
      .post('/api/notifications/test-placement-escalation')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ batchId: 'BATCH-001' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.recipients).toEqual(['po@example.com'])
      })
  })

  it('rejects trainer access to email delivery verification endpoints and logs', async () => {
    const trainerToken = await login('trainer')

    await request(createApp())
      .post('/api/notifications/test-trainer-reminder')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ batchId: 'BATCH-001' })
      .expect(403)

    await request(createApp())
      .get('/api/notifications/email-logs')
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(403)
  })

  it('never sends placement officer onboarding escalation for Internal/Mavericks', async () => {
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({ status: 'Completed' }),
    ])

    await request(createApp())
      .post('/api/notifications/run/onboarding')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)

    const createdNotifications = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(createdNotifications.map((entry) => entry.event)).toEqual(['participant_not_onboarded'])
    expect(createdNotifications.some((entry) => entry.recipients.includes('po@example.com'))).toBe(false)
  })

  it('sends placement officer escalation for External/Segue onboarding only', async () => {
    process.env.SCHEDULER_SECRET = 'scheduler-secret'
    mockPrisma.batch.findMany.mockResolvedValue([
      makeSchedulerBatch({
        status: 'Completed',
        trainingType: 'Segue',
        batchType: 'External/Segue',
        participants: [{
          ...participants[0],
          participantType: 'External',
          email: 'asha@example.com',
          collegeName: 'Demo Institute',
          placementOfficerEmail: 'po@example.com',
          isOnboarded: false,
          onboardingStatus: 'Pending',
        }],
      }),
    ])

    await request(createApp())
      .post('/api/notifications/run/onboarding')
      .set('x-scheduler-secret', 'scheduler-secret')
      .expect(200)

    const createdNotifications = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(createdNotifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'participant_not_onboarded', recipients: ['asha@example.com'] }),
      expect.objectContaining({
        event: 'placement_officer_participant_not_onboarded_escalation',
        recipients: ['po@example.com'],
      }),
    ]))
    expect(mockPrisma.emailLog.create).toHaveBeenCalledTimes(2)
  })

  it('sends manual External/Segue low-score escalation to participant with placement officer CC', async () => {
    const coordinatorToken = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      trainingType: 'Segue',
      batchType: 'External/Segue',
      participants: [{ ...participants[1], placementOfficerEmail: 'po@example.com' }],
      assessments,
      feedbackRuns: [],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/notifications/evaluate')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ source: 'Teams', riskEscalationsOnly: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
        expect(body.data.recipients[0]).toMatchObject({
          event: 'external_low_assessment_score',
          participantEmail: 'dev@example.com',
          placementOfficerCc: 'po@example.com',
          status: 'Sent',
        })
      })

    const notifications = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'external_low_assessment_score', recipients: ['dev@example.com'] }),
    ]))
    expect(notifications.some((entry) => entry.event === 'low_attendance')).toBe(false)
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'external_low_assessment_score', to: ['dev@example.com'], cc: ['po@example.com'] }) }),
    )
  })

  it('sends low-score notifications to an External participant with placement officer CC', async () => {
    const trainerToken = await login('trainer')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      trainingType: 'Segue',
      batchType: 'External/Segue',
      participants: [{ ...participants[1], placementOfficerEmail: 'po@example.com' }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/assessments/ASM-001/results')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        uploadedFileName: 'external-scores.xlsx',
        results: [{
          participantId: 'p2',
          empId: 'EMP-002',
          name: 'Dev Menon',
          email: 'dev@example.com',
          scorePercent: 60,
        }],
      })
      .expect(201)

    const notifications = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'external_low_assessment_score', recipients: ['dev@example.com'] }),
    ]))
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'external_low_assessment_score', to: ['dev@example.com'], cc: ['po@example.com'] }) }),
    )
  })

  it('does not CC a placement officer for Internal/Mavericks low assessment score reminders', async () => {
    const trainerToken = await login('trainer')

    await request(createApp())
      .post('/api/batches/BATCH-001/assessments/ASM-001/results')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        uploadedFileName: 'internal-scores.xlsx',
        results: [{ participantId: 'p2', name: 'Dev Menon', email: 'dev@example.com', scorePercent: 60 }],
      })
      .expect(201)

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'low_assessment_score', to: ['dev@example.com'], cc: [] }) }),
    )
  })

  it('allows coordinators to close incomplete batches and rejects trainer edit or close', async () => {
    const coordinatorToken = await login('coordinator')
    const trainerToken = await login('trainer')

    await request(createApp())
      .put('/api/batches/BATCH-001')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ batchId: 'BATCH-001', trainingName: 'Denied', trainingType: 'Internal', status: 'Running' })
      .expect(403)

    await request(createApp())
      .patch('/api/batches/BATCH-001/close')
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(403)

    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      status: 'Planned',
      assessments: [],
      attendanceSessions: [],
      feedbackRuns: [],
      logs: [],
    })

    await request(createApp())
      .patch('/api/batches/BATCH-001/close')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe('Closed')
      })
  })

  it('returns assessment stats and toppers', async () => {
    const token = await login('trainer')

    await request(createApp())
      .get('/api/batches/BATCH-001/assessments/stats')
      .set('Authorization', `Bearer ${token}`)
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
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toMatchObject({
          participantId: 'p1',
          finalScore: 90,
        })
      })
  })

  it('accepts another score upload for an assessment with existing results', async () => {
    const token = await login('trainer')

    await request(createApp())
      .post('/api/batches/BATCH-001/assessments/ASM-001/results')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uploadedFileName: 'scores-attempt-2.xlsx',
        results: [{
          participantId: 'p1',
          empId: 'EMP-001',
          name: 'Asha Rao',
          email: 'asha@example.com',
          scorePercent: 88,
          comments: 'Second upload',
        }],
      })
      .expect(201)

    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockPrisma.assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ participantId: 'p1', scorePercent: 88 }),
            ]),
          }),
        }),
      }),
    )
  })

  it('returns feedback summary', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .get('/api/batches/BATCH-001/feedback/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.summary).toContain('Average feedback rating')
      })
  })

  it('returns attendance report data', async () => {
    const token = await login('trainer')

    await request(createApp())
      .get('/api/batches/BATCH-001/attendance/report')
      .set('Authorization', `Bearer ${token}`)
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

  it('allows only admins to manage admin, coordinator, and trainer access users', async () => {
    const adminToken = await login('admin')
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: 'Admin' }),
            expect.objectContaining({ role: 'Coordinator' }),
            expect.objectContaining({ role: 'Trainer' }),
          ]),
        )
      })

    await request(createApp())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Coordinator', email: 'new.coordinator@example.com', role: 'Coordinator' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          email: 'new.coordinator@example.com',
          role: 'Coordinator',
        })
      })

    await request(createApp())
      .post('/api/users')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ name: 'Denied Admin', email: 'denied.admin@example.com', role: 'Admin' })
      .expect(403)
  })

  it('allows an admin to deactivate and reactivate access users with an audit entry', async () => {
    const adminToken = await login('admin')

    await request(createApp())
      .patch('/api/users/user-trainer/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: 'user-trainer', role: 'Trainer', status: 'Inactive' })
      })

    await request(createApp())
      .patch('/api/users/user-coordinator/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Active' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: 'user-coordinator', status: 'Active' })
      })

    expect(mockPrisma.log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'user_deactivated', type: 'Access', recipient: 'trainer@mavericks.demo' }),
      }),
    )
  })

  it('prevents the last active admin from deactivating their own account', async () => {
    mockPrisma.user.count.mockResolvedValueOnce(0)
    const adminToken = await login('admin')

    await request(createApp())
      .patch('/api/users/user-admin/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'CONFLICT',
          message: 'Cannot deactivate the only active administrator.',
        })
      })

    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects login and existing sessions for inactive users', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ ...demoUsers.Trainer, status: 'Inactive' })

    await request(createApp())
      .post('/api/auth/demo-login')
      .send({ role: 'trainer' })
      .expect(404)

    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...demoUsers.Trainer, status: 'Inactive' })
    await request(createApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signSessionToken(demoUsers.Trainer)}`)
      .expect(403)
  })

  it('sends feedback requests only to coordinator-selected participants', async () => {
    const token = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/trigger')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eligibleParticipantIds: ['p1'],
        feedbackLink: 'https://feedback.example/form',
        closureDeadline: '2026-06-01T12:00:00.000Z',
      })
      .expect(200)

    const requests = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(requests).toEqual([
      expect.objectContaining({
        event: 'feedback_request',
        participantId: 'p1',
        recipients: ['asha@example.com'],
      }),
    ])
  })

  it('sends feedback requests using a resolved participantEmail alias', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      participants: [{
        ...participants[0],
        email: '',
        participantEmail: 'feedback.participant@example.com',
      }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/trigger')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eligibleParticipantIds: ['p1'],
        feedbackLink: 'https://feedback.example/form',
      })
      .expect(200)

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'feedback_request',
          participantId: 'p1',
          recipients: ['feedback.participant@example.com'],
        }),
      }),
    )
  })

  it('uses the coordinator feedback link and increments feedback reminder count per participant', async () => {
    const token = await login('coordinator')
    let storedRun = { ...feedbackRun, reminderCounts: {}, responses: [] }
    mockPrisma.feedbackRun.findFirst.mockImplementation(() => storedRun)
    mockPrisma.feedbackRun.update.mockImplementation(({ data }) => {
      storedRun = { ...storedRun, ...data, responses: [] }
      return storedRun
    })

    for (let index = 0; index < 2; index += 1) {
      await request(createApp())
        .post('/api/batches/BATCH-001/feedback/trigger')
        .set('Authorization', `Bearer ${token}`)
        .send({
          eligibleParticipantIds: ['p1'],
          feedbackLink: 'https://feedback.example/coordinator-form',
          endAt: '2026-06-01T12:00:00.000Z',
        })
        .expect(200)
    }

    const requests = mockPrisma.notification.create.mock.calls.map(([call]) => call.data)
    expect(requests).toHaveLength(2)
    expect(requests[0].metadata).toMatchObject({ reminderCount: 1, feedbackLink: 'https://feedback.example/coordinator-form' })
    expect(requests[0].message).toContain('Reminder 1 - Initial Feedback Request')
    expect(requests[0].message).toContain('https://feedback.example/coordinator-form')
    expect(requests[1].metadata).toMatchObject({ reminderCount: 2 })
    expect(requests[1].message).toContain('Reminder 2')
  })

  it('skips feedback delivery with a visible missing-email reason', async () => {
    const token = await login('coordinator')
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      participants: [{ ...participants[0], email: '', empEmail: '', officialEmail: '', participantEmail: '' }],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/trigger')
      .set('Authorization', `Bearer ${token}`)
      .send({ eligibleParticipantIds: ['p1'], feedbackLink: 'https://feedback.example/form' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.deliverySummary).toMatchObject({ sent: 0, skipped: 1 })
        expect(body.data.deliverySummary.recipients[0]).toMatchObject({ status: 'Skipped', reason: 'Missing email', reminderCount: 1 })
      })

    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'feedback_request', status: 'Skipped', error: 'Missing email' }) }),
    )
  })

  it('parses uploaded CSV feedback responses and stores rule-based AI analysis', async () => {
    const token = await login('coordinator')
    const csv = 'Emp ID,Emp Name,Emp Email,Rating,Comments,Top 3 takeaways\nEMP-001,Asha Rao,asha@example.com,5,Excellent examples,Practical labs'

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/responses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uploadedFileName: 'feedback.csv',
        fileContentBase64: Buffer.from(csv).toString('base64'),
      })
      .expect(201)

    expect(mockPrisma.feedbackRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadedFileType: 'csv',
          aiAnalysis: expect.objectContaining({ averageTrainerRating: 5, generatedBy: 'rules' }),
          responses: { create: [expect.objectContaining({ participantId: 'p1', rating: 5, matched: true })] },
        }),
      }),
    )
  })

  it('parses Trainer Rating aliases and calculates uploaded feedback averages without treating blanks as zero', async () => {
    const token = await login('coordinator')
    const csv = [
      'Emp ID,Emp Name,Emp Email,Trainer Rating,Comments',
      'EMP-001,Asha Rao,asha@example.com,5,Practical and clear',
      'EMP-002,Dev Menon,dev@example.com,4,Useful',
      'EMP-003,Ria Shah,ria@example.com,2,Too fast',
      'EMP-004,No Rating,norating@example.com,,Impactful',
    ].join('\n')

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/responses')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadedFileName: 'trainer-rating.csv', fileContentBase64: Buffer.from(csv).toString('base64') })
      .expect(201)

    const updateData = mockPrisma.feedbackRun.update.mock.calls.at(-1)[0].data
    expect(updateData.responses.create.map((response) => response.rating)).toEqual([5, 4, 2, null])
    expect(updateData.aiAnalysis.averageTrainerRating).toBe(3.67)
    expect(updateData.aiAnalysis.averageContentQuality).toBeGreaterThan(0)
    expect(updateData.aiAnalysis.averageTrainerEffectiveness).toBeGreaterThan(0)
  })

  it('parses uploaded XLSX feedback response rows', async () => {
    const token = await login('coordinator')
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Feedback')
    sheet.addRow(['Emp ID', 'Emp Name', 'Emp Email', 'Rating', 'Comments'])
    sheet.addRow(['EMP-001', 'Asha Rao', 'asha@example.com', 4, 'Helpful'])
    const fileContentBase64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/responses')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadedFileName: 'feedback.xlsx', fileContentBase64 })
      .expect(201)

    expect(mockPrisma.feedbackRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadedFileType: 'xlsx',
          responses: { create: [expect.objectContaining({ participantId: 'p1', rating: 4 })] },
        }),
      }),
    )
  })

  it('allows a real participant session to submit eligible feedback', async () => {
    const token = participantSessionToken()
    mockPrisma.batch.findUnique.mockResolvedValueOnce({
      ...batch,
      participants: [{
        ...participants[0],
        email: participantUser.email,
      }],
    })
    mockPrisma.feedbackRun.findFirst.mockResolvedValueOnce({
      ...feedbackRun,
      closedAt: null,
      closureDeadline: null,
      eligibleParticipantIds: ['p1'],
    })

    await request(createApp())
      .post('/api/batches/BATCH-001/feedback/fb1/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rating: 5,
        topTakeaways: 'Good fundamentals',
        improvements: 'More exercises',
        courseImpact: 'Useful',
        assignmentUsefulness: 'Useful',
        demonstrationUsefulness: 'Useful',
        trainerSupportFeedback: 'Strong support',
        technicalDiscussionUsefulness: 'Useful',
        comments: 'Well delivered',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.submitted).toBe(true)
      })

    expect(mockPrisma.feedbackResponse.upsert).toHaveBeenCalled()
  })

  it('reports whether demo authentication is enabled', async () => {
    await request(createApp())
      .get('/api/auth/config')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.demoAuthEnabled).toBe(true)
      })
  })

  it('does not expose the local bootstrap login unless explicitly enabled', async () => {
    process.env.ENABLE_DEMO_AUTH = 'false'

    await request(createApp())
      .post('/api/auth/demo-login')
      .send({ role: 'admin' })
      .expect(404)

    process.env.ENABLE_DEMO_AUTH = 'true'
  })

  it('blocks participant staff resources and returns only personal dashboard attendance', async () => {
    const token = participantSessionToken()

    for (const path of [
      '/api/batches',
      '/api/batches/BATCH-001/lifecycle',
      '/api/batches/BATCH-001/feedback/summary',
      '/api/batches/BATCH-001/assessments/stats',
      '/api/batches/BATCH-001/attendance/report',
      '/api/batches/BATCH-001/reports/consolidated-data',
      '/api/logs',
      '/api/notifications',
      '/api/trainer-profiles',
    ]) {
      await request(createApp())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(403)
    }

    mockPrisma.batch.findMany.mockResolvedValueOnce([{
      ...batch,
      participants: [{
        ...participants[0],
        id: 'participant-own',
        name: 'Neha Rao',
        email: participantUser.email,
      }],
      assessments: [{
        id: 'future-assessment',
        name: 'Read-only Checkpoint',
        date: new Date('2099-05-30T00:00:00.000Z'),
        type: 'Quiz',
      }],
      attendanceSessions: [{
        sessionDate: '2026-05-01',
        records: [{ participantId: 'participant-own', durationMinutes: 60 }],
      }],
    }])

    await request(createApp())
      .get('/api/participant/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.assignments[0]).toMatchObject({
          trainingName: 'React Basics',
          attendancePercentage: 100,
          attendanceHistory: [{ date: '2026-05-01', status: 'Present', durationMinutes: 60 }],
          upcomingAssessments: [
            expect.objectContaining({ name: 'Read-only Checkpoint' }),
          ],
        })
        expect(body.data.assignments[0]).not.toHaveProperty('participants')
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

  it('returns deterministic AI decision summaries for coordinator and admin', async () => {
    const coordinatorToken = await login('coordinator')
    const adminToken = await login('admin')

    await request(createApp())
      .get('/api/batches/BATCH-001/ai-summary')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          batchId: 'BATCH-001',
          generatedBy: 'rules',
          highRiskCount: 1,
        })
        expect(body.data.participantRisks).toHaveLength(2)
        expect(body.data.participantRisks[1].signalsUsed).toContain('assessment:60%<70%')
      })

    await request(createApp())
      .get('/api/batches/BATCH-001/ai-anomalies')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.generatedBy).toBe('rules')
        expect(Array.isArray(body.data.anomalies)).toBe(true)
      })
  })

  it('returns AI bundle rule data on initial load without calling OpenAI', async () => {
    process.env.AI_DECISION_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .get('/api/batches/BATCH-001/ai-insights')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          cached: false,
          generatedBy: 'rules',
          summary: { generatedBy: 'rules' },
        })
      })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('generates and caches all AI insight sections through one OpenAI request', async () => {
    process.env.AI_DECISION_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          summary: { summary: 'Combined executive summary.', recommendedActions: ['Review risks.'] },
          feedback: {
            sentimentSummary: 'Combined feedback summary.',
            topIssues: ['Review pacing.'],
            positiveThemes: ['Practical examples.'],
            trainerEffectivenessInsights: ['Continue monitoring ratings.'],
            actionItems: ['Review feedback with trainer.'],
          },
          topper: { justification: 'Topper remains selected under the first-attempt rule.' },
          anomalies: { narrative: 'Review identified rule anomalies.' },
        }),
      }),
    })
    vi.stubGlobal('fetch', fetchImpl)
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/ai-insights/generate-all')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          cached: false,
          generatedBy: 'openai',
          summary: { summary: 'Combined executive summary.', generatedBy: 'openai' },
        })
      })

    await request(createApp())
      .post('/api/batches/BATCH-001/ai-insights/generate-all')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ cached: true, generatedBy: 'openai' })
      })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(mockPrisma.aiInsight.upsert).toHaveBeenCalledTimes(1)
  })

  it('returns a successful rule-based AI insight bundle when OpenAI is rate limited', async () => {
    process.env.AI_DECISION_ENABLED = 'true'
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const coordinatorToken = await login('coordinator')

    await request(createApp())
      .post('/api/batches/BATCH-001/ai-insights/generate-all')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ refresh: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          generatedBy: 'rules',
          aiFallbackReason: 'rate_limited',
          summary: { generatedBy: 'rules' },
        })
      })
  })

  it('prevents participant access to AI analytics endpoints', async () => {
    await request(createApp())
      .get('/api/batches/BATCH-001/ai-summary')
      .set('Authorization', `Bearer ${participantSessionToken()}`)
      .expect(403)
  })
})
