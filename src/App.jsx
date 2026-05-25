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
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCog,
  UserCheck,
  UserPlus,
  UserX,
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
import { createNotification } from './services/notificationService'
import { getSystemSettings, updateSystemSettings } from './services/settingsService'
import { listTrainerProfiles, saveTrainerProfiles } from './services/trainerProfileService'
import { calculateTopper, getAssessmentStats } from './utils/assessmentEngine'
import { getBatchHealth, getHealthBadgeClasses } from './utils/attendanceEngine'
import { getBatchCloseReadiness } from './utils/batchLifecycle'
import { createLogEntry } from './utils/notificationEngine'
import { loadFromStorage, saveToStorage } from './utils/storage'

const BATCH_STORAGE_KEY = 'mavericks_phase2_batches'
const ADMIN_USERS_STORAGE_KEY = 'mavericks_admin_users'
const SIMULATED_TRAINER_NAME = 'Avery Shah'
const SIMULATED_PARTICIPANT_EMAIL = 'neha.rao@example.com'

const adminRoles = ['Admin', 'Coordinator', 'Trainer']
const userStatuses = ['Active', 'Inactive']

const defaultAdminUsers = [
  {
    id: 'USR-ADMIN-001',
    name: 'Mavericks Admin',
    email: 'admin@mavericks.local',
    role: 'Admin',
    status: 'Active',
  },
  {
    id: 'USR-COORD-001',
    name: 'Riya Menon',
    email: 'riya.menon@example.com',
    role: 'Coordinator',
    status: 'Active',
  },
  {
    id: 'USR-TRAIN-001',
    name: 'Avery Shah',
    email: 'avery.shah@example.com',
    role: 'Trainer',
    status: 'Active',
  },
]

const defaultAdminSettings = {
  attendanceGraceMinutes: 20,
  attendanceDeadlineTime: '10:00',
  assessmentCutoffDefault: 70,
  feedbackEnabled: true,
  reminderMockEnabled: true,
  topperCalculationMode: 'First-attempt cleared participants only',
  topperCutoffThreshold: 70,
  excludeRetakeScores: true,
}

const defaultTrainerProfiles = [
  {
    id: 'TRN-001',
    name: 'Avery Shah',
    email: 'avery.shah@example.com',
    empId: 'TR-1001',
    unitOrCompetency: 'Operational Excellence',
    phone: '+91 90000 10001',
    specialization: 'Execution Delivery',
  },
  {
    id: 'TRN-002',
    name: 'Mira Thomas',
    email: 'mira.thomas@example.com',
    empId: 'TR-1002',
    unitOrCompetency: 'Customer Success',
    phone: '+91 90000 10002',
    specialization: 'Client Enablement',
  },
]

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

const baseNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { label: 'Batches', icon: BriefcaseBusiness, section: 'batches' },
  { label: 'Reports', icon: PieChart, section: 'reports' },
]

const adminNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { label: 'User Management', icon: Users, section: 'users' },
  { label: 'Role Management', icon: UserCog, section: 'roles' },
  { label: 'System Settings', icon: Settings, section: 'settings' },
  { label: 'Topper Criteria', icon: SlidersHorizontal, section: 'topper-criteria' },
  { label: 'Batches', icon: BriefcaseBusiness, section: 'batches' },
  { label: 'Reports', icon: PieChart, section: 'reports' },
]

const coordinatorNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { label: 'Batches', icon: BriefcaseBusiness, section: 'batches' },
  { label: 'Trainers', icon: GraduationCap, section: 'trainers' },
  { label: 'Attendance', icon: BadgeCheck, section: 'attendance' },
  { label: 'Assessments', icon: Medal, section: 'assessments' },
  { label: 'Feedback', icon: Sparkles, section: 'feedback' },
  { label: 'Reports', icon: PieChart, section: 'reports' },
]

const trainerNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { label: 'Assigned Batches', icon: BriefcaseBusiness, section: 'batches' },
  { label: 'Attendance', icon: BadgeCheck, section: 'attendance' },
  { label: 'Assessments', icon: Medal, section: 'assessments' },
  { label: 'Reports', icon: PieChart, section: 'reports' },
]

function getNavItems(activeRole) {
  if (activeRole === 'coordinator') return coordinatorNavItems
  if (activeRole === 'trainer') return trainerNavItems
  return activeRole === 'admin' ? adminNavItems : baseNavItems
}

function getSectionTitle(activeRole, section) {
  const navItem = getNavItems(activeRole).find((item) => item.section === section)
  return navItem?.label ?? 'Dashboard'
}

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
  const [logs, setLogs] = useState(() => mockLogs.map(normalizeLog))
  const [adminUsers, setAdminUsers] = useState(() =>
    loadFromStorage(ADMIN_USERS_STORAGE_KEY, defaultAdminUsers),
  )
  const [adminSettings, setAdminSettings] = useState(defaultAdminSettings)
  const [trainerProfiles, setTrainerProfiles] = useState(defaultTrainerProfiles)
  const [logDataMode, setLogDataMode] = useState('local')
  const [settingsDataMode, setSettingsDataMode] = useState('local')
  const [trainerProfileDataMode, setTrainerProfileDataMode] = useState('local')
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
        console.warn('Backend logs unavailable; using in-memory mock fallback.', error)
        if (isMounted) setLogDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    getSystemSettings()
      .then((settings) => {
        if (!isMounted) return
        setAdminSettings({ ...defaultAdminSettings, ...settings })
        setSettingsDataMode('api')
      })
      .catch((error) => {
        console.warn('Backend settings unavailable; using in-memory defaults.', error)
        if (isMounted) setSettingsDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    listTrainerProfiles()
      .then((profiles) => {
        if (!isMounted) return
        setTrainerProfiles(profiles.length ? profiles : defaultTrainerProfiles)
        setTrainerProfileDataMode('api')
      })
      .catch((error) => {
        console.warn('Backend trainer profiles unavailable; using in-memory defaults.', error)
        if (isMounted) setTrainerProfileDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    saveToStorage(BATCH_STORAGE_KEY, batches)
  }, [batches])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  useEffect(() => {
    saveToStorage(ADMIN_USERS_STORAGE_KEY, adminUsers)
  }, [adminUsers])

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
          console.warn('Backend log persistence failed; keeping in-memory state.')
          setLogDataMode('local')
        }
      })
      Promise.allSettled(
        uniqueLogs
          .filter((log) => log.category === 'notification' || log.channel === 'Email')
          .map((log) => createNotification({
            batchId: log.batchId,
            event: log.event ?? log.action,
            message: log.message,
            recipients: log.recipients ?? [log.recipient].filter(Boolean),
            status: log.status ?? 'Mock Sent',
            type: log.type,
          })),
      ).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          console.warn('Backend notification persistence failed; notification remains in log stream.')
        }
      })
    }

    setLogs((currentLogs) => {
      return [...uniqueLogs, ...currentLogs].slice(0, 200)
    })
  }

  const updateAdminSettings = (updater) => {
    setAdminSettings((currentSettings) => {
      const nextSettings =
        typeof updater === 'function' ? updater(currentSettings) : updater

      if (settingsDataMode === 'api') {
        updateSystemSettings(nextSettings).catch((error) => {
          console.warn('Backend settings persistence failed; keeping in-memory state.', error)
          setSettingsDataMode('local')
        })
      }

      return nextSettings
    })
  }

  const updateTrainerProfiles = (updater) => {
    setTrainerProfiles((currentProfiles) => {
      const nextProfiles =
        typeof updater === 'function' ? updater(currentProfiles) : updater

      if (trainerProfileDataMode === 'api') {
        saveTrainerProfiles(nextProfiles).catch((error) => {
          console.warn('Backend trainer profile persistence failed; keeping in-memory state.', error)
          setTrainerProfileDataMode('local')
        })
      }

      return nextProfiles
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
    const previousBatch = batches.find((batch) => batch.batchId === previousBatchId)

    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === previousBatchId ? enrichedBatch : batch,
      ),
    )
    appendLogs([
      createLogEntry({
        action: 'batch_edited',
        batchId: enrichedBatch.batchId,
        message: `Batch ${enrichedBatch.batchId} was updated.`,
      }),
      ...(previousBatch && previousBatch.status !== enrichedBatch.status
        ? [
            createLogEntry({
              action: 'batch_status_changed',
              batchId: enrichedBatch.batchId,
              message: `Batch ${enrichedBatch.batchId} status changed from ${previousBatch.status} to ${enrichedBatch.status}.`,
            }),
          ]
        : []),
    ])

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
    appendLogs([
      createLogEntry({
        action: 'batch_closed',
        batchId,
        message: `Batch ${batchId} was closed.`,
      }),
      createLogEntry({
        action: 'batch_status_changed',
        batchId,
        message: `Batch ${batchId} status changed to Closed.`,
      }),
    ])

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
      adminSettings={adminSettings}
      adminUsers={adminUsers}
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
      onUpdateAdminSettings={updateAdminSettings}
      onUpdateAdminUsers={setAdminUsers}
      onUpdateTrainerProfiles={updateTrainerProfiles}
      role={roles[selectedRole]}
      section={route.section}
      trainerProfiles={trainerProfiles}
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
    assessmentDates: batch.assessmentDates ?? '',
    assignedTrainers: batch.assignedTrainers ?? (
      batch.trainer?.name
        ? [
            {
              name: batch.trainer.name,
              email: batch.trainer.email ?? '',
              empId: batch.trainerEmpId ?? '',
              unitOrCompetency: batch.trainerUnitOrCompetency ?? '',
              phone: batch.trainer.phone ?? '',
              specialization: batch.trainer.specialization ?? '',
            },
          ]
        : []
    ),
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
      <section className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col justify-center px-4 py-10 sm:px-5 lg:px-6">
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
  adminSettings,
  adminUsers,
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
  onUpdateAdminSettings,
  onUpdateAdminUsers,
  onUpdateTrainerProfiles,
  role,
  section,
  trainerProfiles,
}) {
  const RoleIcon = role.icon
  const activeSection = section
  const navItems = getNavItems(activeRole)

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#080a10] text-zinc-100 lg:flex">
      <aside className="border-b border-white/10 bg-[#05070c]/95 px-3 py-3 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
        <div className="flex items-center justify-between lg:block">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Mavericks</p>
              <p className="text-[11px] text-zinc-500">Execution Platform</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 lg:mt-5 lg:w-full lg:justify-start lg:gap-2 lg:px-3"
            aria-label="Change role"
            title="Change role"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-xs font-medium lg:inline">Change role</span>
          </button>
        </div>

        <div className="mt-4 hidden rounded-lg border border-white/10 bg-white/[0.035] p-3 lg:block">
          <div
            className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${role.accent} text-black shadow-lg ${role.glow}`}
          >
            <RoleIcon className="h-4 w-4" />
          </div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Active role</p>
          <h2 className="mt-1 text-base font-semibold text-white">{role.title}</h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{role.description}</p>
        </div>

        <nav className="mt-3 flex gap-2 overflow-x-auto lg:mt-4 lg:block lg:space-y-1 lg:overflow-visible">
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
                className={`flex min-w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 lg:w-full ${
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

        <div className="mt-4 hidden border-t border-white/10 pt-4 lg:block">
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
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
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 ${
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

      <main className="min-w-0 w-full lg:ml-60">
        <RoleShellHeader
          activeRole={activeRole}
          section={section}
          role={role}
          onNavigate={onNavigate}
        />
        {section === 'batches' ? (
          <BatchManagement
            activeRole={activeRole}
            attendanceDeadlineTime={adminSettings?.attendanceDeadlineTime ?? '10:00'}
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
        ) : activeRole === 'admin' && section === 'users' ? (
          <UserManagementPage users={adminUsers} onUpdateUsers={onUpdateAdminUsers} />
        ) : activeRole === 'admin' && section === 'roles' ? (
          <RoleManagementPage users={adminUsers} onUpdateUsers={onUpdateAdminUsers} />
        ) : activeRole === 'admin' && section === 'settings' ? (
          <SystemSettingsPage settings={adminSettings} onUpdateSettings={onUpdateAdminSettings} />
        ) : activeRole === 'admin' && section === 'topper-criteria' ? (
          <TopperCriteriaPage settings={adminSettings} onUpdateSettings={onUpdateAdminSettings} />
        ) : activeRole === 'coordinator' && section === 'trainers' ? (
          <TrainerManagementPage
            batches={batches}
            onUpdateBatch={onUpdateBatch}
            onUpdateTrainerProfiles={onUpdateTrainerProfiles}
            trainers={trainerProfiles}
          />
        ) : activeRole === 'coordinator' && section === 'attendance' ? (
          <CoordinatorAttendancePage batches={batches} onNavigate={onNavigate} />
        ) : activeRole === 'coordinator' && section === 'assessments' ? (
          <CoordinatorAssessmentsPage batches={batches} onNavigate={onNavigate} />
        ) : activeRole === 'coordinator' && section === 'feedback' ? (
          <CoordinatorFeedbackPage batches={batches} onNavigate={onNavigate} />
        ) : activeRole === 'trainer' && section === 'attendance' ? (
          <TrainerAttendancePage batches={batches} onNavigate={onNavigate} />
        ) : activeRole === 'trainer' && section === 'assessments' ? (
          <TrainerAssessmentsPage batches={batches} onNavigate={onNavigate} />
        ) : (
          <DashboardPage
            adminSettings={adminSettings}
            adminUsers={adminUsers}
            activeRole={activeRole}
            batches={batches}
            logs={logs}
            onNavigate={onNavigate}
            role={role}
            trainerProfiles={trainerProfiles}
          />
        )}
      </main>
    </div>
  )
}

function RoleShellHeader({ activeRole, onNavigate, role, section }) {
  const sectionTitle = getSectionTitle(activeRole, section)
  const showReportsAction = section !== 'reports' && activeRole !== 'participant'

  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-[#080a10]/95 px-4 py-3 backdrop-blur sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            {role.title} / {sectionTitle}
          </p>
          <h1 className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
            {sectionTitle}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {showReportsAction ? (
            <button
              type="button"
              onClick={() => onNavigate(`/${activeRole}/reports`)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <PieChart className="h-4 w-4" />
              Reports
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DashboardPage({
  activeRole,
  adminSettings,
  adminUsers = [],
  batches,
  logs = [],
  onNavigate,
  role,
  trainerProfiles = [],
}) {
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

  if (activeRole === 'admin') {
    return (
      <AdminDashboard
        batches={batches}
        settings={adminSettings}
        users={adminUsers}
      />
    )
  }

  if (activeRole === 'coordinator') {
    return (
      <CoordinatorDashboard
        batches={batches}
        logs={logs}
        onNavigate={onNavigate}
        trainers={trainerProfiles}
      />
    )
  }

  if (activeRole === 'trainer') {
    return <TrainerDashboard batches={batches} onNavigate={onNavigate} />
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
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

function TrainerDashboard({ batches, onNavigate }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString().slice(0, 10)
  const todaySessions = batches.filter((batch) => batch.startDate === todayIso)
  const attendancePending = getAttendancePendingBatches(batches)
  const byType = getTrainerAssessmentPendingByType(batches)
  const evidencePending = getAssessmentEvidencePendingBatches(batches)
  const metrics = [
    { label: 'Assigned Batches', value: batches.length, trend: 'Trainer-visible batches', icon: BriefcaseBusiness },
    { label: "Today's Sessions", value: todaySessions.length, trend: 'Scheduled for today', icon: CalendarDays },
    { label: 'Attendance Pending', value: attendancePending.length, trend: 'Daily upload needed', icon: BadgeCheck },
    { label: 'Sprint Review Scores Pending', value: byType.sprintReview, trend: 'Scores missing', icon: ClipboardList },
    { label: 'API Assessment Scores Pending', value: byType.apiAssessment, trend: 'Scores missing', icon: Medal },
    { label: 'Coding Assessment Scores Pending', value: byType.codingAssessment, trend: 'Scores missing', icon: BookOpenCheck },
    { label: 'Project Evaluation Pending', value: byType.projectEvaluation, trend: 'Scores or evidence needed', icon: Target },
    { label: 'Assessment Evidence Pending', value: evidencePending.length, trend: 'Documents not uploaded', icon: FileEvidenceIcon },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-white/10 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Delivery Inputs
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          Trainer Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Upload attendance, assessment scores, project evaluation files, and assessment evidence for assigned batches.
        </p>
      </header>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Attendance Inputs" icon={BadgeCheck}>
          <CoordinatorBatchList
            activeRole="trainer"
            batches={attendancePending.length ? attendancePending : batches.slice(0, 4)}
            emptyText="No assigned batches."
            onNavigate={onNavigate}
            reason={(batch) =>
              hasAttendanceUploaded(batch)
                ? 'Attendance available.'
                : 'Attendance upload pending.'
            }
          />
        </Panel>
        <Panel title="Assessment Inputs" icon={Medal}>
          <CoordinatorBatchList
            activeRole="trainer"
            batches={getAssessmentInputPendingBatches(batches).slice(0, 5)}
            emptyText="No pending assessment inputs."
            onNavigate={onNavigate}
            reason={(batch) => {
              const stats = getAssessmentStats(batch)
              return `Scores remaining ${stats.remaining}; evidence ${hasAssessmentEvidence(batch) ? 'available' : 'pending'}.`
            }}
          />
        </Panel>
      </section>
    </div>
  )
}

function CoordinatorDashboard({ batches, logs, onNavigate, trainers }) {
  const missingAttendance = getAttendancePendingBatches(batches)
  const delayedAttendance = getDelayedAttendanceBatches(batches)
  const assessmentsPending = getAssessmentsPendingBatches(batches)
  const feedbackPending = getFeedbackPendingBatches(batches)
  const runningBatches = batches.filter((batch) => batch.status === 'Running')
  const upcomingSessions = getUpcomingSessions(batches)
  const recentActivity = getRecentActivity(logs, [])
  const healthCounts = batches.reduce(
    (counts, batch) => {
      const health = getBatchHealth(batch)
      counts[health.tone] = (counts[health.tone] ?? 0) + 1
      return counts
    },
    { critical: 0, warning: 0, healthy: 0 },
  )
  const metrics = [
    { label: 'Total Batches', value: batches.length, trend: 'Visible execution batches', icon: BriefcaseBusiness },
    { label: 'Running Batches', value: runningBatches.length, trend: 'Currently in delivery', icon: Activity },
    { label: 'Upcoming Sessions', value: upcomingSessions.length, trend: 'Next scheduled sessions', icon: CalendarDays },
    { label: 'Attendance Pending Uploads', value: missingAttendance.length, trend: `${delayedAttendance.length} delayed`, icon: BadgeCheck },
    { label: 'Assessments Pending', value: assessmentsPending.length, trend: 'Need setup or scores', icon: Medal },
    { label: 'Feedback Pending', value: feedbackPending.length, trend: 'Trigger or responses pending', icon: Sparkles },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-white/10 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Execution Governance
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          Coordinator Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Monitor batch delivery, attendance compliance, assessment readiness, trainer coverage, and feedback completion.
        </p>
      </header>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Batch Health Overview" icon={BarChart3}>
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetric label="Critical" value={healthCounts.critical} tone="critical" />
            <CompactMetric label="Moderate" value={healthCounts.warning} tone="warning" />
            <CompactMetric label="Healthy" value={healthCounts.healthy} tone="healthy" />
          </div>
          <div className="mt-4 grid gap-2">
            {missingAttendance.slice(0, 4).map((batch) => (
              <CoordinatorActionRow
                key={batch.batchId}
                batch={batch}
                detail="Attendance upload pending"
                onNavigate={onNavigate}
              />
            ))}
            {!missingAttendance.length ? (
              <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-400">
                Attendance uploads are current for visible batches.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Upcoming Sessions" icon={CalendarDays}>
          <div className="space-y-2">
            {upcomingSessions.map((batch) => (
              <CoordinatorActionRow
                key={batch.batchId}
                batch={batch}
                detail={`${batch.startDate} | ${batch.timings || 'Timing not set'} | ${batch.trainer?.name ?? 'Trainer not assigned'}`}
                onNavigate={onNavigate}
              />
            ))}
            {!upcomingSessions.length ? (
              <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-400">
                No upcoming sessions scheduled.
              </p>
            ) : null}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Recent Batch Activity" icon={ClipboardList}>
          <div className="grid gap-2">
            {(recentActivity.length ? recentActivity.slice(0, 6) : ['No recent batch activity.']).map((item) => (
              <div
                key={item}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300"
              >
                {item}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Trainer Coverage" icon={GraduationCap}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactMetric label="Trainer Profiles" value={trainers.length} tone="healthy" />
            <CompactMetric
              label="Unassigned Batches"
              value={batches.filter((batch) => !batch.trainer?.name).length}
              tone="warning"
            />
          </div>
        </Panel>
      </section>
    </div>
  )
}

function TrainerManagementPage({ batches, onUpdateBatch, onUpdateTrainerProfiles, trainers }) {
  const [editingTrainerId, setEditingTrainerId] = useState('')
  const [form, setForm] = useState(() => createEmptyTrainerProfile())
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.batchId ?? '')
  const [selectedTrainerId, setSelectedTrainerId] = useState(trainers[0]?.id ?? '')
  const selectedBatch = batches.find((batch) => batch.batchId === selectedBatchId)
  const selectedTrainer = trainers.find((trainer) => trainer.id === selectedTrainerId)
  const editingTrainer = trainers.find((trainer) => trainer.id === editingTrainerId)

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const resetForm = () => {
    setEditingTrainerId('')
    setForm(createEmptyTrainerProfile())
  }

  const editTrainer = (trainer) => {
    setEditingTrainerId(trainer.id)
    setForm({
      name: trainer.name,
      email: trainer.email,
      empId: trainer.empId,
      unitOrCompetency: trainer.unitOrCompetency,
      phone: trainer.phone,
      specialization: trainer.specialization,
    })
  }

  const saveTrainer = (event) => {
    event.preventDefault()
    const nextTrainer = {
      id: editingTrainerId || `TRN-${Date.now().toString().slice(-6)}`,
      ...form,
    }

    onUpdateTrainerProfiles((currentTrainers) =>
      editingTrainerId
        ? currentTrainers.map((trainer) =>
            trainer.id === editingTrainerId ? nextTrainer : trainer,
          )
        : [...currentTrainers, nextTrainer],
    )
    setSelectedTrainerId(nextTrainer.id)
    resetForm()
  }

  const assignTrainer = () => {
    if (!selectedBatch || !selectedTrainer) return
    const trainerAssignment = {
      name: selectedTrainer.name,
      email: selectedTrainer.email,
      empId: selectedTrainer.empId,
      unitOrCompetency: selectedTrainer.unitOrCompetency,
      phone: selectedTrainer.phone,
      specialization: selectedTrainer.specialization,
    }
    const assignedTrainers = [
      ...(selectedBatch.assignedTrainers ?? []).filter(
        (trainer) =>
          trainer.email !== trainerAssignment.email &&
          trainer.empId !== trainerAssignment.empId,
      ),
      trainerAssignment,
    ]

    onUpdateBatch(selectedBatch.batchId, {
      ...selectedBatch,
      assignedTrainers,
      trainerEmpId: selectedTrainer.empId,
      trainerUnitOrCompetency: selectedTrainer.unitOrCompetency,
      trainer: {
        name: selectedTrainer.name,
        email: selectedTrainer.email,
        phone: selectedTrainer.phone,
        specialization: selectedTrainer.specialization,
      },
    })
  }

  return (
    <CoordinatorSection
      description="Maintain trainer profiles and assign trainers to execution batches. Stored locally until trainer APIs are added."
      title="Trainer Management"
    >
      <form
        onSubmit={saveTrainer}
        className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <AdminTextField label="Name" value={form.name} onChange={(value) => updateField('name', value)} />
        <AdminTextField label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} />
        <AdminTextField label="Emp ID" value={form.empId} onChange={(value) => updateField('empId', value)} />
        <AdminTextField label="Unit/Competency" value={form.unitOrCompetency} onChange={(value) => updateField('unitOrCompetency', value)} />
        <AdminTextField label="Phone" value={form.phone} onChange={(value) => updateField('phone', value)} />
        <AdminTextField label="Specialization" value={form.specialization} onChange={(value) => updateField('specialization', value)} />
        <div className="flex gap-2 md:col-span-2 xl:col-span-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <UserPlus className="h-4 w-4" />
            {editingTrainer ? 'Save trainer' : 'Add trainer'}
          </button>
          {editingTrainer ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-base font-semibold text-white">Assign Trainer to Batch</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <AdminSelectField
            label="Batch"
            options={batches.map((batch) => batch.batchId)}
            value={selectedBatchId}
            onChange={setSelectedBatchId}
          />
          <AdminSelectField
            label="Trainer"
            options={trainers.map((trainer) => trainer.id)}
            value={selectedTrainerId}
            onChange={setSelectedTrainerId}
          />
          <button
            type="button"
            onClick={assignTrainer}
            disabled={!selectedBatch || !selectedTrainer}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 md:self-end"
          >
            Assign
          </button>
        </div>
        {selectedTrainer ? (
          <p className="mt-3 text-sm text-zinc-400">
            Selected trainer: {selectedTrainer.name} | {selectedTrainer.specialization}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {trainers.map((trainer) => (
          <article key={trainer.id} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{trainer.name}</p>
                <p className="mt-1 truncate text-sm text-zinc-400">{trainer.email}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {trainer.empId || 'No Emp ID'} | {trainer.unitOrCompetency || 'Unit not set'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {trainer.phone || 'Phone not set'} | {trainer.specialization || 'Specialization not set'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => editTrainer(trainer)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>
    </CoordinatorSection>
  )
}

function CoordinatorAttendancePage({ batches, onNavigate }) {
  const pending = getAttendancePendingBatches(batches)
  const delayed = getDelayedAttendanceBatches(batches)

  return (
    <CoordinatorSection
      description="Track attendance upload compliance and open the batch attendance workspace."
      title="Attendance Governance"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard metric={{ label: 'Pending Uploads', value: pending.length, trend: 'No attendance available', icon: BadgeCheck }} />
        <MetricCard metric={{ label: 'Delayed Uploads', value: delayed.length, trend: 'Started without attendance', icon: Activity }} />
        <MetricCard metric={{ label: 'Compliant Batches', value: batches.length - pending.length, trend: 'Attendance uploaded or closed', icon: CheckCircle2 }} />
      </div>
      <CoordinatorBatchList
        batches={pending.length ? pending : batches}
        emptyText="No attendance governance items."
        onNavigate={onNavigate}
        reason={(batch) =>
          pending.some((item) => item.batchId === batch.batchId)
            ? 'Attendance upload pending. Open batch to upload Teams/Webex/Manual Template or send reminder.'
            : 'Attendance currently available.'
        }
      />
    </CoordinatorSection>
  )
}

function CoordinatorAssessmentsPage({ batches, onNavigate }) {
  const pending = getAssessmentsPendingBatches(batches)

  return (
    <CoordinatorSection
      description="Monitor assessment setup, score uploads, clearance, and topper readiness."
      title="Assessment Governance"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard metric={{ label: 'Pending Assessments', value: pending.length, trend: 'Setup or scores needed', icon: Medal }} />
        <MetricCard metric={{ label: 'Configured Assessments', value: batches.filter((batch) => batch.assessments?.length).length, trend: 'Assessment plans created', icon: ClipboardList }} />
        <MetricCard metric={{ label: 'Topper Ready', value: batches.filter((batch) => calculateTopper(batch).length).length, trend: 'First-attempt rule applied', icon: TrophyIcon }} />
      </div>
      <CoordinatorBatchList
        batches={pending.length ? pending : batches}
        emptyText="No assessment governance items."
        onNavigate={onNavigate}
        reason={(batch) => {
          const stats = getAssessmentStats(batch)
          return `Clearance ${stats.clearanceRate}% | Remaining ${stats.remaining} | Open batch for question files, setup, or score upload.`
        }}
      />
    </CoordinatorSection>
  )
}

function CoordinatorFeedbackPage({ batches, onNavigate }) {
  const pending = getFeedbackPendingBatches(batches)

  return (
    <CoordinatorSection
      description="Monitor feedback triggers, uploaded responses, and summary completion."
      title="Feedback Governance"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard metric={{ label: 'Feedback Pending', value: pending.length, trend: 'Trigger or response needed', icon: Sparkles }} />
        <MetricCard metric={{ label: 'Triggered', value: batches.filter((batch) => batch.feedback?.triggeredAt).length, trend: 'Feedback requests sent', icon: SendIcon }} />
        <MetricCard metric={{ label: 'Responses Available', value: batches.filter((batch) => batch.feedback?.responses?.length).length, trend: 'Feedback uploaded', icon: MessageIcon }} />
      </div>
      <CoordinatorBatchList
        batches={pending.length ? pending : batches}
        emptyText="No feedback governance items."
        onNavigate={onNavigate}
        reason={(batch) =>
          batch.feedback?.responses?.length
            ? `${batch.feedback.responses.length} response(s) available.`
            : 'Feedback trigger or response upload pending.'
        }
      />
    </CoordinatorSection>
  )
}

function TrainerAttendancePage({ batches, onNavigate }) {
  const pending = getAttendancePendingBatches(batches)

  return (
    <CoordinatorSection
      roleLabel="Trainer"
      description="Open assigned batches to download manual templates or upload Manual Template, Teams, or Webex attendance."
      title="Trainer Attendance"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard metric={{ label: 'Assigned Batches', value: batches.length, trend: 'Trainer scope', icon: BriefcaseBusiness }} />
        <MetricCard metric={{ label: 'Attendance Pending', value: pending.length, trend: 'Upload needed', icon: BadgeCheck }} />
        <MetricCard metric={{ label: 'Attendance Uploaded', value: batches.length - pending.length, trend: 'Input complete', icon: CheckCircle2 }} />
      </div>
      <CoordinatorBatchList
        activeRole="trainer"
        batches={pending.length ? pending : batches}
        emptyText="No assigned attendance items."
        onNavigate={onNavigate}
        reason={(batch) =>
          hasAttendanceUploaded(batch)
            ? 'Attendance available. Open batch to review table or export.'
            : 'Upload Manual Template Excel, Teams CSV, or Webex CSV.'
        }
      />
    </CoordinatorSection>
  )
}

function TrainerAssessmentsPage({ batches, onNavigate }) {
  const pending = getAssessmentInputPendingBatches(batches)
  const byType = getTrainerAssessmentPendingByType(batches)

  return (
    <CoordinatorSection
      roleLabel="Trainer"
      description="Open assigned batches to upload Sprint Review, API, Coding, Project Evaluation scores and supporting evidence."
      title="Trainer Assessments"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard metric={{ label: 'Sprint Review Pending', value: byType.sprintReview, trend: 'Scores missing', icon: ClipboardList }} />
        <MetricCard metric={{ label: 'API Pending', value: byType.apiAssessment, trend: 'Scores missing', icon: Medal }} />
        <MetricCard metric={{ label: 'Coding Pending', value: byType.codingAssessment, trend: 'Scores missing', icon: BookOpenCheck }} />
        <MetricCard metric={{ label: 'Project Pending', value: byType.projectEvaluation, trend: 'Scores or evidence missing', icon: Target }} />
      </div>
      <CoordinatorBatchList
        activeRole="trainer"
        batches={pending.length ? pending : batches}
        emptyText="No assigned assessment inputs."
        onNavigate={onNavigate}
        reason={(batch) => {
          const stats = getAssessmentStats(batch)
          return `Upload scores/evidence. Remaining scores: ${stats.remaining}.`
        }}
      />
    </CoordinatorSection>
  )
}

function CoordinatorSection({ children, description, roleLabel = 'Coordinator', title }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-white/10 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          {roleLabel}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
      </header>
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  )
}

function CoordinatorBatchList({ activeRole = 'coordinator', batches, emptyText, onNavigate, reason }) {
  return (
    <div className="grid gap-3">
      {batches.map((batch) => (
        <CoordinatorActionRow
          activeRole={activeRole}
          key={batch.batchId}
          batch={batch}
          detail={reason(batch)}
          onNavigate={onNavigate}
        />
      ))}
      {!batches.length ? (
        <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
          {emptyText}
        </p>
      ) : null}
    </div>
  )
}

function CoordinatorActionRow({ activeRole = 'coordinator', batch, detail, onNavigate }) {
  const health = getBatchHealth(batch)

  return (
    <button
      type="button"
      onClick={() => onNavigate(`/${activeRole}/batches/${batch.batchId}`)}
      className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-left outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-300 sm:grid-cols-[1fr_auto]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">{batch.trainingName}</span>
        <span className="mt-1 block truncate text-xs text-zinc-500">{batch.batchId} | {detail}</span>
      </span>
      <span className={`inline-flex h-fit w-fit rounded-full border px-3 py-1 text-xs font-medium ${getHealthBadgeClasses(health.tone)}`}>
        {health.level}
      </span>
    </button>
  )
}

function CompactMetric({ label, tone, value }) {
  return (
    <div className={`rounded-lg border p-3 ${
      tone === 'critical'
        ? 'border-red-400/30 bg-red-400/10'
        : tone === 'warning'
          ? 'border-yellow-400/30 bg-yellow-400/10'
          : 'border-emerald-400/30 bg-emerald-400/10'
    }`}>
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function createEmptyTrainerProfile() {
  return {
    name: '',
    email: '',
    empId: '',
    unitOrCompetency: '',
    phone: '',
    specialization: '',
  }
}

function hasAttendanceUploaded(batch) {
  return Boolean(
    batch.healthSnapshot?.attendanceUploaded ||
    ['completed', 'done'].includes(batch.timeline?.['Day-wise Attendance Uploaded']),
  )
}

function getAttendancePendingBatches(batches) {
  return batches.filter((batch) => batch.status !== 'Closed' && !hasAttendanceUploaded(batch))
}

function getDelayedAttendanceBatches(batches) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return getAttendancePendingBatches(batches).filter((batch) => {
    if (!batch.startDate) return false
    return new Date(`${batch.startDate}T00:00:00`) < today
  })
}

function getAssessmentsPendingBatches(batches) {
  return batches.filter((batch) => {
    const stats = getAssessmentStats(batch)
    return batch.status !== 'Closed' && (!batch.assessments?.length || stats.remaining > 0)
  })
}

function getFeedbackPendingBatches(batches) {
  return batches.filter((batch) => {
    const feedback = batch.feedback
    return batch.status !== 'Closed' && (!feedback?.triggeredAt || !feedback?.responses?.length)
  })
}

function normalizeAssessmentType(type) {
  return String(type ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hasAssessmentEvidence(batch) {
  return (batch.assessments ?? []).some(
    (assessment) => assessment.evidenceFiles?.length || assessment.questionFileName,
  )
}

function getAssessmentEvidencePendingBatches(batches) {
  return batches.filter(
    (batch) => batch.status !== 'Closed' && (batch.assessments ?? []).some((assessment) => !assessment.evidenceFiles?.length),
  )
}

function isAssessmentScorePending(assessment) {
  return !(assessment.results?.length)
}

function getTrainerAssessmentPendingByType(batches) {
  return batches.reduce(
    (counts, batch) => {
      ;(batch.assessments ?? []).forEach((assessment) => {
        if (!isAssessmentScorePending(assessment)) return
        const type = normalizeAssessmentType(assessment.type)

        if (type.includes('sprint')) counts.sprintReview += 1
        else if (type.includes('api')) counts.apiAssessment += 1
        else if (type.includes('coding')) counts.codingAssessment += 1
        else if (type.includes('project')) counts.projectEvaluation += 1
      })
      return counts
    },
    {
      apiAssessment: 0,
      codingAssessment: 0,
      projectEvaluation: 0,
      sprintReview: 0,
    },
  )
}

function getAssessmentInputPendingBatches(batches) {
  return batches.filter((batch) => {
    const stats = getAssessmentStats(batch)
    return (
      batch.status !== 'Closed' &&
      (
        stats.remaining > 0 ||
        (batch.assessments ?? []).some((assessment) => !assessment.evidenceFiles?.length)
      )
    )
  })
}

function TrophyIcon(props) {
  return <Medal {...props} />
}

function SendIcon(props) {
  return <Sparkles {...props} />
}

function MessageIcon(props) {
  return <ClipboardList {...props} />
}

function FileEvidenceIcon(props) {
  return <ClipboardList {...props} />
}

function AdminDashboard({ batches, settings, users }) {
  const activeUsers = users.filter((user) => user.status === 'Active')
  const settingsConfigured = Boolean(
    settings?.attendanceGraceMinutes &&
    settings?.assessmentCutoffDefault &&
    settings?.topperCalculationMode,
  )
  const metrics = [
    { label: 'Total Users', value: users.length, trend: 'Registered governance users', icon: Users },
    { label: 'Total Trainers', value: users.filter((user) => user.role === 'Trainer').length, trend: 'Trainer accounts', icon: GraduationCap },
    { label: 'Total Coordinators', value: users.filter((user) => user.role === 'Coordinator').length, trend: 'Coordinator accounts', icon: CalendarDays },
    { label: 'Total Admins', value: users.filter((user) => user.role === 'Admin').length, trend: 'System administrators', icon: ShieldCheck },
    { label: 'Active Batches', value: batches.filter((batch) => batch.status !== 'Closed').length, trend: 'Non-closed execution batches', icon: BriefcaseBusiness },
    { label: 'System Settings Status', value: settingsConfigured ? 'Configured' : 'Needs Review', trend: `${activeUsers.length} active user accounts`, icon: Settings },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-white/10 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          System Governance
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          Admin Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Manage platform users, role access, settings, and topper governance criteria.
        </p>
      </header>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>
    </div>
  )
}

function UserManagementPage({ onUpdateUsers, users }) {
  const [editingUserId, setEditingUserId] = useState('')
  const [form, setForm] = useState(() => createEmptyAdminUser())
  const editingUser = users.find((user) => user.id === editingUserId)

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const resetForm = () => {
    setEditingUserId('')
    setForm(createEmptyAdminUser())
  }

  const editUser = (user) => {
    setEditingUserId(user.id)
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    })
  }

  const saveUser = (event) => {
    event.preventDefault()
    const nextUser = {
      id: editingUserId || `USR-${Date.now().toString().slice(-6)}`,
      ...form,
    }

    onUpdateUsers((currentUsers) =>
      editingUserId
        ? currentUsers.map((user) => (user.id === editingUserId ? nextUser : user))
        : [...currentUsers, nextUser],
    )
    resetForm()
  }

  const deactivateUser = (userId) => {
    onUpdateUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId ? { ...user, status: 'Inactive' } : user,
      ),
    )
  }

  return (
    <AdminSection
      description="Create, edit, and deactivate Admin, Coordinator, and Trainer accounts."
      title="User Management"
    >
      <form
        onSubmit={saveUser}
        className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_180px_auto]"
      >
        <AdminTextField label="Name" value={form.name} onChange={(value) => updateField('name', value)} />
        <AdminTextField label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} />
        <AdminSelectField label="Role" options={adminRoles} value={form.role} onChange={(value) => updateField('role', value)} />
        <AdminSelectField label="Status" options={userStatuses} value={form.status} onChange={(value) => updateField('status', value)} />
        <div className="flex gap-2 self-end">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {editingUser ? 'Save' : 'Add'}
          </button>
          {editingUser ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <AdminUsersTable
        onDeactivateUser={deactivateUser}
        onEditUser={editUser}
        users={users}
      />
    </AdminSection>
  )
}

function RoleManagementPage({ onUpdateUsers, users }) {
  const updateRole = (userId, role) => {
    onUpdateUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === userId ? { ...user, role } : user)),
    )
  }

  return (
    <AdminSection
      description="Assign governance roles for Admins, Training Coordinators, and Trainers."
      title="Role Management"
    >
      <div className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-white/[0.045]">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="w-[30%] px-4 py-3 font-medium">User</th>
              <th className="w-[35%] px-4 py-3 font-medium">Email</th>
              <th className="w-[20%] px-4 py-3 font-medium">Role</th>
              <th className="w-[15%] px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((user) => (
              <tr key={user.id} className="text-zinc-300">
                <td className="truncate px-4 py-3 font-medium text-white">{user.name}</td>
                <td className="truncate px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(event) => updateRole(user.id, event.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  >
                    {adminRoles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={user.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  )
}

function SystemSettingsPage({ onUpdateSettings, settings }) {
  const updateSetting = (field, value) => {
    onUpdateSettings((currentSettings) => ({ ...currentSettings, [field]: value }))
  }

  return (
    <AdminSection
      description="Configure platform defaults used by execution workflows. Stored locally until backend settings APIs are added."
      title="System Settings"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SettingsNumberField
          label="Attendance upload grace period"
          max={120}
          min={0}
          suffix="minutes"
          value={settings.attendanceGraceMinutes}
          onChange={(value) => updateSetting('attendanceGraceMinutes', value)}
        />
        <label className="block rounded-lg border border-white/10 bg-white/[0.045] p-4">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Attendance submission deadline
          </span>
          <input
            type="time"
            value={settings.attendanceDeadlineTime ?? '10:00'}
            onChange={(event) => updateSetting('attendanceDeadlineTime', event.target.value)}
            className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
          />
        </label>
        <SettingsNumberField
          label="Assessment cutoff default"
          max={100}
          min={0}
          suffix="%"
          value={settings.assessmentCutoffDefault}
          onChange={(value) => updateSetting('assessmentCutoffDefault', value)}
        />
        <SettingsToggle
          checked={settings.feedbackEnabled}
          label="Feedback enabled"
          onChange={(value) => updateSetting('feedbackEnabled', value)}
        />
        <SettingsToggle
          checked={settings.reminderMockEnabled}
          label="Reminder mock toggle"
          onChange={(value) => updateSetting('reminderMockEnabled', value)}
        />
      </div>
    </AdminSection>
  )
}

function TopperCriteriaPage({ onUpdateSettings, settings }) {
  const updateSetting = (field, value) => {
    onUpdateSettings((currentSettings) => ({ ...currentSettings, [field]: value }))
  }

  return (
    <AdminSection
      description="Govern topper eligibility. The current approved calculation remains first-attempt cleared participants only."
      title="Topper Criteria"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block rounded-lg border border-white/10 bg-white/[0.045] p-4">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Topper calculation mode
          </span>
          <select
            value={settings.topperCalculationMode}
            onChange={(event) => updateSetting('topperCalculationMode', event.target.value)}
            className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
          >
            <option value="First-attempt cleared participants only">
              First-attempt cleared participants only
            </option>
          </select>
        </label>
        <SettingsNumberField
          label="Assessment cutoff threshold"
          max={100}
          min={0}
          suffix="%"
          value={settings.topperCutoffThreshold}
          onChange={(value) => updateSetting('topperCutoffThreshold', value)}
        />
        <SettingsToggle
          checked={settings.excludeRetakeScores}
          label="Exclude retake scores from topper ranking"
          onChange={(value) => updateSetting('excludeRetakeScores', value)}
        />
      </div>
    </AdminSection>
  )
}

function createEmptyAdminUser() {
  return {
    name: '',
    email: '',
    role: 'Trainer',
    status: 'Active',
  }
}

function AdminSection({ children, description, title }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-white/10 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
        <p className="mt-2 text-xs text-zinc-500">
          TODO: Persist this governance data through backend user/settings APIs.
        </p>
      </header>
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  )
}

function AdminUsersTable({ onDeactivateUser, onEditUser, users }) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-white/[0.045]">
      <table className="w-full min-w-[760px] table-fixed text-left text-sm">
        <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="w-[25%] px-4 py-3 font-medium">Name</th>
            <th className="w-[30%] px-4 py-3 font-medium">Email</th>
            <th className="w-[15%] px-4 py-3 font-medium">Role</th>
            <th className="w-[15%] px-4 py-3 font-medium">Status</th>
            <th className="w-[15%] px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {users.map((user) => (
            <tr key={user.id} className="text-zinc-300">
              <td className="truncate px-4 py-3 font-medium text-white">{user.name}</td>
              <td className="truncate px-4 py-3">{user.email}</td>
              <td className="px-4 py-3">{user.role}</td>
              <td className="px-4 py-3">
                <UserStatusBadge status={user.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEditUser(user)}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeactivateUser(user.id)}
                    disabled={user.status === 'Inactive'}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Deactivate
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminTextField({ label, onChange, type = 'text', value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <input
        required
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      />
    </label>
  )
}

function AdminSelectField({ label, onChange, options, value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function SettingsNumberField({ label, max, min, onChange, suffix, value }) {
  return (
    <label className="block rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
        />
        <span className="w-20 text-sm text-zinc-400">{suffix}</span>
      </div>
    </label>
  )
}

function SettingsToggle({ checked, label, onChange }) {
  return (
    <label className="flex min-h-28 items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <span>
        <span className="block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </span>
        <span className="mt-2 block text-sm text-zinc-300">{checked ? 'Enabled' : 'Disabled'}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-cyan-300"
      />
    </label>
  )
}

function UserStatusBadge({ status }) {
  const active = status === 'Active'
  const Icon = active ? UserCheck : UserX

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
      active
        ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
        : 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300'
    }`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
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
