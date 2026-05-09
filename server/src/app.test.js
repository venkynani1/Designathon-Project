import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test'
process.env.JWT_SECRET = 'test-secret'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.NODE_ENV = 'test'

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
  assessment: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
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
  aiInsight: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('./db.js', () => ({ prisma: mockPrisma }))

const { createApp } = await import('./app.js')

const now = new Date('2026-05-09T10:00:00.000Z')
const demoUsers = {
  Admin: {
    id: 'user-admin',
    name: 'Mavericks Admin',
    email: 'admin@mavericks.demo',
    role: 'Admin',
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
  trainerName: 'Avery Shah',
  trainerEmail: 'trainer@example.com',
  trainerPhone: '',
  trainerSpecialization: 'React',
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
  const insightStore = []

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
  mockPrisma.batch.findUnique.mockImplementation(({ where }) =>
    where.batchCode === batch.batchCode ? batch : null,
  )
  mockPrisma.assessment.findMany.mockResolvedValue(assessments)
  mockPrisma.assessment.findFirst.mockResolvedValue(assessments[0])
  mockPrisma.feedbackRun.findFirst.mockResolvedValue(feedbackRun)
  mockPrisma.attendanceSession.findMany.mockResolvedValue(attendanceSessions)
  mockPrisma.attendanceSummary.upsert.mockResolvedValue({})
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
