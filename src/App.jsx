import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  LogOut,
  Medal,
  PieChart,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BatchManagement } from './components/BatchManagement'
import { ReportsPage } from './components/ReportsModule'
import { mockBatches, mockLogs } from './data/mockData'
import {
  createBatchRecord,
  createParticipantRecord,
  closeBatchRecord,
  deleteParticipantRecord,
  listBatches,
  updateBatchRecord,
} from './services/batchService'
import { demoLogin, logoutDemoUser } from './services/authService'
import { createLogRecord, listLogs } from './services/logService'
import { getAssessmentStats } from './utils/assessmentEngine'
import { getBatchHealth, getHealthBadgeClasses } from './utils/attendanceEngine'
import { getBatchCloseReadiness } from './utils/batchLifecycle'
import { createLogEntry } from './utils/notificationEngine'
import { loadFromStorage, saveToStorage } from './utils/storage'

const BATCH_STORAGE_KEY = 'mavericks_phase2_batches'
const LOG_STORAGE_KEY = 'mavericks_execution_logs'
const SIMULATED_TRAINER_NAME = 'Avery Shah'
const SIMULATED_PARTICIPANT_EMAIL = 'neha.rao@example.com'

const roles = {
  admin: {
    title: 'Admin',
    subtitle: 'Portfolio command center',
    description: 'Oversee programs, cohorts, compliance, and performance signals.',
    icon: ShieldCheck,
    accent: 'from-amber-300 to-orange-500',
    glow: 'shadow-amber-500/20',
    route: '/admin',
    metrics: [
      { label: 'Live programs', value: '18', trend: '+4 this month', icon: LayoutDashboard },
      { label: 'Active cohorts', value: '46', trend: '92% on track', icon: Users },
      { label: 'Completion rate', value: '87%', trend: '+6.2% vs last cycle', icon: BadgeCheck },
      { label: 'Escalations', value: '09', trend: '3 high priority', icon: Activity },
    ],
    focus: [
      'Approve Q2 execution calendar',
      'Review regional cohort health',
      'Audit trainer utilization',
    ],
    pipeline: [
      { label: 'Programs planned', value: 72 },
      { label: 'Programs in flight', value: 54 },
      { label: 'Programs completed', value: 87 },
    ],
    activity: [
      'North Zone submitted compliance pack',
      'Leadership cohort crossed 80% milestone',
      'Trainer allocation report is ready',
    ],
  },
  coordinator: {
    title: 'Coordinator',
    subtitle: 'Execution operations desk',
    description: 'Coordinate cohorts, schedules, venue readiness, and participant movement.',
    icon: CalendarDays,
    accent: 'from-cyan-300 to-blue-500',
    glow: 'shadow-cyan-500/20',
    route: '/coordinator',
    metrics: [
      { label: 'Cohorts assigned', value: '12', trend: '4 start this week', icon: ClipboardList },
      { label: 'Session readiness', value: '94%', trend: '2 pending checks', icon: CheckCircle2 },
      { label: 'Open tickets', value: '17', trend: '5 due today', icon: Activity },
      { label: 'Attendance average', value: '89%', trend: '+3.4% trend', icon: BarChart3 },
    ],
    focus: [
      'Confirm Friday venue setup',
      'Resolve participant onboarding gaps',
      'Publish trainer travel roster',
    ],
    pipeline: [
      { label: 'Scheduled', value: 82 },
      { label: 'Ready', value: 64 },
      { label: 'At risk', value: 18 },
    ],
    activity: [
      'Trainer briefing deck marked complete',
      'Batch 7 attendance uploaded',
      'Venue checklist needs final approval',
    ],
  },
  trainer: {
    title: 'Trainer',
    subtitle: 'Learning delivery cockpit',
    description: 'Track sessions, learners, assessments, and classroom momentum.',
    icon: GraduationCap,
    accent: 'from-emerald-300 to-teal-500',
    glow: 'shadow-emerald-500/20',
    route: '/trainer',
    metrics: [
      { label: 'Sessions this week', value: '08', trend: '3 completed', icon: BookOpenCheck },
      { label: 'Learners active', value: '128', trend: '91% engaged', icon: Users },
      { label: 'Assessment average', value: '82%', trend: '+5 points', icon: Medal },
      { label: 'Feedback score', value: '4.7', trend: 'from 214 ratings', icon: Sparkles },
    ],
    focus: [
      'Prepare capstone evaluation',
      'Review low-confidence learners',
      'Upload module 4 artifacts',
    ],
    pipeline: [
      { label: 'Prepared', value: 76 },
      { label: 'Delivered', value: 58 },
      { label: 'Evaluated', value: 42 },
    ],
    activity: [
      'Module 3 quiz average improved',
      'Peer practice room assigned',
      'Feedback comments need review',
    ],
  },
  participant: {
    title: 'Participant',
    subtitle: 'Personal execution hub',
    description: 'View progress, tasks, sessions, assessments, and upcoming milestones.',
    icon: Target,
    accent: 'from-rose-300 to-fuchsia-500',
    glow: 'shadow-rose-500/20',
    route: '/participant',
    metrics: [
      { label: 'Program progress', value: '68%', trend: 'Module 5 active', icon: LineChart },
      { label: 'Tasks complete', value: '23/31', trend: '2 due today', icon: CheckCircle2 },
      { label: 'Session streak', value: '06', trend: 'Keep it going', icon: Activity },
      { label: 'Assessment score', value: '84%', trend: '+7 from baseline', icon: Medal },
    ],
    focus: [
      'Submit reflection worksheet',
      'Attend live practice lab',
      'Complete readiness survey',
    ],
    pipeline: [
      { label: 'Learning', value: 68 },
      { label: 'Practice', value: 56 },
      { label: 'Assessment', value: 44 },
    ],
    activity: [
      'New resource added to your module',
      'Mentor note available for review',
      'Practice lab opens at 4:00 PM',
    ],
  },
}

const roleOrder = ['admin', 'coordinator', 'trainer', 'participant']

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { label: 'Batches', icon: BriefcaseBusiness, section: 'batches' },
  { label: 'Reports', icon: PieChart, section: 'reports' },
]

function parseRoute(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const role = roles[segments[0]] ? segments[0] : null

  return {
    role,
    section: role ? segments[1] ?? 'dashboard' : 'selector',
    batchId: role ? segments[2] : null,
  }
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [batches, setBatches] = useState(() =>
    loadFromStorage(BATCH_STORAGE_KEY, mockBatches).map(enrichBatchDefaults),
  )
  const [batchDataMode, setBatchDataMode] = useState('local')
  const [logs, setLogs] = useState(() => {
    const savedLogs = loadFromStorage(LOG_STORAGE_KEY, mockLogs)
    return savedLogs.length ? mergeDemoLogs(savedLogs) : mockLogs
  })
  const [logDataMode, setLogDataMode] = useState('local')
  const logsRef = useRef(logs)
  const route = parseRoute(path)
  const selectedRole = route.role

  const navigate = (to) => {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!selectedRole) {
      logoutDemoUser()
      return undefined
    }

    demoLogin(selectedRole)
      .catch((error) => {
        console.warn('Backend demo auth unavailable; continuing with simulated role UI.', error)
      })
  }, [selectedRole])

  useEffect(() => {
    let isMounted = true

    listBatches()
      .then((backendBatches) => {
        if (!isMounted) return

        setBatches(backendBatches.map(enrichBatchDefaults))
        setBatchDataMode('api')
      })
      .catch((error) => {
        console.warn('Backend batches unavailable; using localStorage fallback.', error)
        if (isMounted) setBatchDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    listLogs()
      .then((backendLogs) => {
        if (!isMounted) return

        setLogs(backendLogs.map(normalizeLog))
        setLogDataMode('api')
      })
      .catch((error) => {
        console.warn('Backend logs unavailable; using localStorage fallback.', error)
        if (isMounted) setLogDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    saveToStorage(BATCH_STORAGE_KEY, batches)
  }, [batches])

  useEffect(() => {
    saveToStorage(LOG_STORAGE_KEY, logs)
    logsRef.current = logs
  }, [logs])

  const appendLogs = (nextLogs) => {
    const normalizedLogs = Array.isArray(nextLogs) ? nextLogs : [nextLogs]
    const existingKeys = new Set(
      logsRef.current.map((log) => `${log.action}|${log.batchId}|${log.message}`),
    )
    const uniqueLogs = normalizedLogs.filter(
      (log) => !existingKeys.has(`${log.action}|${log.batchId}|${log.message}`),
    )

    if (!uniqueLogs.length) {
      return
    }

    if (logDataMode === 'api') {
      Promise.allSettled(uniqueLogs.map((log) => createLogRecord(log))).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          console.warn('Backend log persistence failed; keeping localStorage fallback.')
          setLogDataMode('local')
        }
      })
    }

    setLogs((currentLogs) => {
      return [...uniqueLogs, ...currentLogs].slice(0, 200)
    })
  }

  const createBatch = async (batch) => {
    let persistedBatch = batch

    if (batchDataMode === 'api') {
      try {
        persistedBatch = await createBatchRecord(batch)
      } catch (error) {
        console.warn('Backend create batch failed; keeping local fallback state.', error)
        setBatchDataMode('local')
      }
    }

    const nextBatch = enrichBatchDefaults(persistedBatch)

    setBatches((currentBatches) => [
      ...currentBatches.filter((currentBatch) => currentBatch.batchId !== nextBatch.batchId),
      nextBatch,
    ])
    appendLogs(
      createLogEntry({
        action: 'batch_created',
        batchId: nextBatch.batchId,
        message: `Batch ${nextBatch.batchId} was created.`,
      }),
    )

    return nextBatch
  }

  const updateBatch = async (previousBatchId, nextBatch) => {
    let persistedBatch = nextBatch

    if (batchDataMode === 'api') {
      try {
        const apiBatch = await updateBatchRecord(previousBatchId, nextBatch)
        persistedBatch = {
          ...nextBatch,
          ...apiBatch,
          assessments: nextBatch.assessments ?? apiBatch.assessments,
          feedback: nextBatch.feedback ?? apiBatch.feedback,
          healthSnapshot: nextBatch.healthSnapshot ?? apiBatch.healthSnapshot,
          timeline: nextBatch.timeline ?? apiBatch.timeline,
          discontinuedParticipantIds:
            nextBatch.discontinuedParticipantIds ?? apiBatch.discontinuedParticipantIds,
          participants: apiBatch.participants ?? nextBatch.participants,
        }
      } catch (error) {
        console.warn('Backend update batch failed; keeping local fallback state.', error)
        setBatchDataMode('local')
      }
    }

    const enrichedBatch = enrichBatchDefaults(persistedBatch)

    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === previousBatchId ? enrichedBatch : batch,
      ),
    )
    appendLogs(
      createLogEntry({
        action: 'batch_edited',
        batchId: enrichedBatch.batchId,
        message: `Batch ${enrichedBatch.batchId} was updated.`,
      }),
    )

    return enrichedBatch
  }

  const closeBatch = async (batchId) => {
    const currentBatch = batches.find((batch) => batch.batchId === batchId)
    let persistedBatch = null

    if (batchDataMode === 'api') {
      try {
        persistedBatch = await closeBatchRecord(batchId)
      } catch (error) {
        if (error.status === 409) {
          console.warn('Batch is not ready to close.', error)
          throw error
        }
        console.warn('Backend close batch failed; keeping local fallback state.', error)
        setBatchDataMode('local')
      }
    }

    if (!persistedBatch) {
      const readiness = currentBatch
        ? getBatchCloseReadiness(currentBatch, logsRef.current)
        : { ready: false }

      if (!readiness.ready) {
        throw new Error('Batch is not ready to close.')
      }
    }

    const nextBatch = enrichBatchDefaults(
      persistedBatch ?? currentBatch ?? { batchId },
    )
    const closedBatch = { ...nextBatch, status: 'Closed' }

    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === batchId ? closedBatch : batch,
      ),
    )
    appendLogs(
      createLogEntry({
        action: 'batch_closed',
        batchId,
        message: `Batch ${batchId} was closed.`,
      }),
    )

    return closedBatch
  }

  const addParticipant = async (batchId, participant) => {
    let persistedParticipant = participant

    if (batchDataMode === 'api') {
      try {
        persistedParticipant = await createParticipantRecord(batchId, participant)
      } catch (error) {
        console.warn('Backend add participant failed; keeping local fallback state.', error)
        setBatchDataMode('local')
      }
    }

    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === batchId
          ? { ...batch, participants: [...batch.participants, persistedParticipant] }
          : batch,
      ),
    )
    appendLogs(
      createLogEntry({
        action: 'participant_added',
        batchId,
        message: `Participant ${persistedParticipant.empName ?? persistedParticipant.name} was added.`,
      }),
    )

    return persistedParticipant
  }

  const deleteParticipant = async (batchId, participantId) => {
    if (batchDataMode === 'api') {
      try {
        await deleteParticipantRecord(batchId, participantId)
      } catch (error) {
        console.warn('Backend delete participant failed; keeping local fallback state.', error)
        setBatchDataMode('local')
      }
    }

    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === batchId
          ? {
              ...batch,
              participants: batch.participants.filter(
                (participant) => participant.id !== participantId,
              ),
            }
          : batch,
      ),
    )
    appendLogs(
      createLogEntry({
        action: 'participant_removed',
        batchId,
        message: `Participant ${participantId} was removed.`,
      }),
    )
  }

  if (!selectedRole) {
    return <RoleSelector onNavigate={navigate} />
  }

  return (
    <DashboardShell
      activeRole={selectedRole}
      batches={getVisibleBatches(batches, selectedRole)}
      batchId={route.batchId}
      logs={logs}
      onLogEvent={appendLogs}
      onNavigate={navigate}
      onAddParticipant={addParticipant}
      onCreateBatch={createBatch}
      onCloseBatch={closeBatch}
      onDeleteParticipant={deleteParticipant}
      onUpdateBatch={updateBatch}
      role={roles[selectedRole]}
      section={route.section}
    />
  )
}

function enrichBatchDefaults(batch) {
  const demoBatch = mockBatches.find((item) => item.batchId === batch.batchId)

  return {
    ...batch,
    batchType:
      batch.batchType ??
      (batch.trainingType === 'Internal' ? 'Internal/Mavericks' : 'External/Segue'),
    assessmentScoreDeadline: batch.assessmentScoreDeadline ?? '',
    customDates: batch.customDates ?? '',
    meetingPlatform: batch.meetingPlatform ?? '',
    scheduleType: batch.scheduleType ?? 'All Days',
    trainerEmpId: batch.trainerEmpId ?? '',
    trainerType: batch.trainerType ?? 'External',
    trainerUnitOrCompetency:
      batch.trainerUnitOrCompetency ?? batch.trainer?.specialization ?? '',
    assessments: batch.assessments ?? demoBatch?.assessments ?? [],
    discontinuedParticipantIds: batch.discontinuedParticipantIds ?? demoBatch?.discontinuedParticipantIds ?? [],
    feedback: batch.feedback ?? demoBatch?.feedback ?? {
      triggeredAt: '',
      responses: [],
      summary: 'Feedback has not been uploaded yet.',
    },
    healthSnapshot: batch.healthSnapshot ?? demoBatch?.healthSnapshot ?? {
      attendanceUploaded: false,
      highRisk: 0,
      mediumRisk: 0,
      assessmentClearance: 100,
    },
    timeline: {
      ...(demoBatch?.timeline ?? {}),
      ...(batch.timeline ?? {}),
    },
  }
}

function mergeDemoLogs(savedLogs) {
  const savedIds = new Set(savedLogs.map((log) => log.id))
  return [
    ...savedLogs.map(normalizeLog),
    ...mockLogs.filter((log) => !savedIds.has(log.id)),
  ]
}

function normalizeLog(log) {
  return {
    ...log,
    recipient: log.recipient ?? 'Coordinator',
    status: log.status ?? (log.category === 'alert' ? 'Open' : 'Completed'),
    type: log.type ?? 'Audit',
  }
}

function getVisibleBatches(batches, activeRole) {
  if (activeRole === 'participant') {
    const enrolledBatches = batches.filter((batch) =>
      batch.participants?.some(
        (participant) =>
          participant.officialEmail === SIMULATED_PARTICIPANT_EMAIL ||
          participant.email === SIMULATED_PARTICIPANT_EMAIL,
      ),
    )

    return enrolledBatches.length ? enrolledBatches : batches.slice(0, 1)
  }

  if (activeRole !== 'trainer') {
    return batches
  }

  const assignedBatches = batches.filter((batch) => batch.trainer?.name === SIMULATED_TRAINER_NAME)
  return assignedBatches.length ? assignedBatches : batches.slice(0, 1)
}

function RoleSelector({ onNavigate }) {
  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-5 py-10 sm:px-8 lg:px-10">
        <div className="mb-10 max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-zinc-300">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Mavericks Execution Platform
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-white sm:text-5xl lg:text-6xl">
            Select your workspace
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            Choose a role to enter the execution workspace with mock operational data.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {roleOrder.map((roleKey) => {
            const role = roles[roleKey]
            const Icon = role.icon

            return (
              <button
                key={role.title}
                onClick={() => onNavigate(role.route)}
                className="group min-h-[280px] rounded-lg border border-white/10 bg-white/[0.045] p-5 text-left shadow-2xl shadow-black/30 outline-none transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <div
                  className={`mb-7 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${role.accent} text-black shadow-lg ${role.glow}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {role.subtitle}
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{role.title}</h2>
                <p className="mt-3 min-h-20 text-sm leading-6 text-zinc-400">
                  {role.description}
                </p>
                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5 text-sm font-medium text-zinc-200">
                  Open dashboard
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function DashboardShell({
  activeRole,
  batches,
  batchId,
  logs,
  onAddParticipant,
  onCreateBatch,
  onCloseBatch,
  onDeleteParticipant,
  onLogEvent,
  onNavigate,
  onUpdateBatch,
  role,
  section,
}) {
  const RoleIcon = role.icon
  const activeSection = section

  return (
    <div className="min-h-screen bg-[#080a10] text-zinc-100 lg:flex">
      <aside className="border-b border-white/10 bg-[#05070c]/95 px-4 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center justify-between lg:block">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-black">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Mavericks</p>
              <p className="text-xs text-zinc-500">Execution Platform</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('/')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 lg:mt-8 lg:w-full lg:justify-start lg:gap-3 lg:px-3"
            aria-label="Change role"
            title="Change role"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-sm lg:inline">Change role</span>
          </button>
        </div>

        <div className="mt-5 hidden rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:block">
          <div
            className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${role.accent} text-black shadow-lg ${role.glow}`}
          >
            <RoleIcon className="h-6 w-6" />
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Active role</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{role.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{role.description}</p>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto lg:mt-6 lg:block lg:space-y-1 lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              activeSection === item.section ||
              (activeSection === 'dashboard' && item.section === 'dashboard')
            const targetPath =
              item.section === 'dashboard'
                ? `/${activeRole}`
                : `/${activeRole}/${item.section}`

            return (
              <button
                key={item.label}
                onClick={() => onNavigate(targetPath)}
                className={`flex min-w-fit items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 lg:w-full ${
                  isActive
                    ? 'bg-white text-black'
                    : 'border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100 lg:border-transparent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-6 hidden border-t border-white/10 pt-5 lg:block">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
            Role switcher
          </p>
          <div className="space-y-1">
            {roleOrder.map((roleKey) => {
              const item = roles[roleKey]
              const Icon = item.icon
              const isActive = roleKey === activeRole

              return (
                <button
                  key={roleKey}
                  onClick={() => onNavigate(item.route)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    isActive
                      ? 'bg-white/[0.09] text-white'
                      : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </span>
                  {isActive ? <ChevronRight className="h-4 w-4" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <main className="w-full lg:ml-72">
        {section === 'batches' ? (
          <BatchManagement
            activeRole={activeRole}
            batchId={batchId}
            batches={batches}
            onAddParticipant={onAddParticipant}
            onCreateBatch={onCreateBatch}
            onCloseBatch={onCloseBatch}
            onDeleteParticipant={onDeleteParticipant}
            onLogEvent={onLogEvent}
            onNavigate={onNavigate}
            onUpdateBatch={onUpdateBatch}
            logs={logs}
          />
        ) : section === 'reports' ? (
          <ReportsPage activeRole={activeRole} batches={batches} onLogEvent={onLogEvent} />
        ) : (
          <DashboardPage
            activeRole={activeRole}
            batches={batches}
            logs={logs}
            onNavigate={onNavigate}
            role={role}
          />
        )}
      </main>
    </div>
  )
}

function DashboardPage({ activeRole, batches, logs = [], onNavigate, role }) {
  const portfolioStats = getPortfolioStats(batches)
  const [now, setNow] = useState(() => new Date())
  const runningBatches = batches.filter((batch) => batch.status === 'Running')
  const upcomingSessions = getUpcomingSessions(batches)
  const recentActivity = getRecentActivity(logs, role.activity)
  const dashboardMetrics = getDashboardMetrics(batches, portfolioStats, role)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            {role.subtitle}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            {role.title} Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Compact execution view for active batches, session readiness, and recent movement.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.045] px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Current time</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs text-zinc-500">
            {now.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Running Batch Health" icon={Activity}>
          <div className="space-y-3">
            {(runningBatches.length ? runningBatches : batches.slice(0, 4)).map((batch) => {
              const health = getBatchHealth(batch)

              return (
                <button
                  key={batch.batchId}
                  onClick={() => onNavigate(`/${activeRole}/batches/${batch.batchId}`)}
                  className="flex w-full flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-left outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{batch.trainingName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{batch.batchId}</p>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium ${getHealthBadgeClasses(health.tone)}`}
                  >
                    {health.level}
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel title="Upcoming Sessions" icon={CalendarDays}>
          <div className="space-y-3">
            {upcomingSessions.map((batch) => (
              <button
                key={batch.batchId}
                onClick={() => onNavigate(`/${activeRole}/batches/${batch.batchId}`)}
                className="grid w-full gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-left outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-300 sm:grid-cols-[1fr_auto]"
              >
                <span>
                  <span className="block text-sm font-medium text-white">{batch.trainingName}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{batch.batchId}</span>
                </span>
                <span className="text-xs text-zinc-400 sm:text-right">
                  {batch.startDate}
                  <span className="block text-zinc-500">{batch.timings}</span>
                </span>
              </button>
            ))}
            {!upcomingSessions.length ? (
              <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No upcoming sessions from current batches.
              </p>
            ) : null}
          </div>
        </Panel>
      </section>

      <section className="mt-5">
        <Panel title="Recent Activity" icon={ClipboardList}>
          <div className="grid gap-3 md:grid-cols-2">
            {recentActivity.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                <p className="text-sm text-zinc-300">{item}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function getDashboardMetrics(batches, portfolioStats, role) {
  if (role.title !== 'Coordinator') return role.metrics

  return [
    { label: 'Total batches', value: batches.length, trend: 'All visible execution batches', icon: BriefcaseBusiness },
    {
      label: 'Running batches',
      value: batches.filter((batch) => batch.status === 'Running').length,
      trend: 'Currently in execution',
      icon: Activity,
    },
    {
      label: 'Participants',
      value: portfolioStats.totalParticipants,
      trend: 'Across current batch registry',
      icon: Users,
    },
    {
      label: 'Clearance rate',
      value: `${portfolioStats.clearanceRate}%`,
      trend: 'Based on uploaded assessments',
      icon: Medal,
    },
  ]
}

function getUpcomingSessions(batches) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return batches
    .filter((batch) => batch.startDate && new Date(`${batch.startDate}T00:00:00`) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)
}

function getRecentActivity(logs, fallback) {
  const logActivity = [...logs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((log) => log.message)

  return logActivity.length ? logActivity : fallback
}

function getPortfolioStats(batches) {
  const totals = batches.reduce(
    (current, batch) => {
      const stats = getAssessmentStats(batch)

      current.totalParticipants += stats.totalParticipants
      current.cleared += stats.cleared
      current.notCleared += stats.notCleared
      current.remaining += stats.remaining
      current.discontinued += batch.discontinuedParticipantIds?.length ?? 0
      return current
    },
    {
      cleared: 0,
      discontinued: 0,
      notCleared: 0,
      remaining: 0,
      totalParticipants: 0,
    },
  )

  return {
    ...totals,
    clearanceRate: totals.totalParticipants
      ? Math.round((totals.cleared / totals.totalParticipants) * 100)
      : 0,
  }
}

function MetricCard({ metric }) {
  const Icon = metric.icon

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-zinc-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-400">{metric.trend}</p>
    </article>
  )
}

function Panel({ children, icon: Icon, title }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black">
            <Icon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}
