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
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  LogOut,
  Medal,
  PieChart,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BatchManagement } from './components/BatchManagement'
import { mockBatches } from './data/mockData'
import { loadFromStorage, saveToStorage } from './utils/storage'

const BATCH_STORAGE_KEY = 'mavericks_phase2_batches'

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
  { label: 'Candidates', icon: UserPlus, section: 'candidates' },
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
  const [batches, setBatches] = useState(() => loadFromStorage(BATCH_STORAGE_KEY, mockBatches))
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
    saveToStorage(BATCH_STORAGE_KEY, batches)
  }, [batches])

  const createBatch = (batch) => {
    setBatches((currentBatches) => [
      ...currentBatches.filter((currentBatch) => currentBatch.batchId !== batch.batchId),
      batch,
    ])
  }

  const updateBatch = (previousBatchId, nextBatch) => {
    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === previousBatchId ? nextBatch : batch,
      ),
    )
  }

  const addParticipant = (batchId, participant) => {
    setBatches((currentBatches) =>
      currentBatches.map((batch) =>
        batch.batchId === batchId
          ? { ...batch, participants: [...batch.participants, participant] }
          : batch,
      ),
    )
  }

  const deleteParticipant = (batchId, participantId) => {
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
  }

  if (!selectedRole) {
    return <RoleSelector onNavigate={navigate} />
  }

  return (
    <DashboardShell
      activeRole={selectedRole}
      batches={batches}
      batchId={route.batchId}
      onNavigate={navigate}
      onAddParticipant={addParticipant}
      onCreateBatch={createBatch}
      onDeleteParticipant={deleteParticipant}
      onUpdateBatch={updateBatch}
      role={roles[selectedRole]}
      section={route.section}
    />
  )
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
  onAddParticipant,
  onCreateBatch,
  onDeleteParticipant,
  onNavigate,
  onUpdateBatch,
  role,
  section,
}) {
  const RoleIcon = role.icon
  const activeSection = section === 'candidates' ? 'candidates' : section

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
        {section === 'batches' || section === 'candidates' ? (
          <BatchManagement
            activeRole={activeRole}
            batchId={batchId}
            batches={batches}
            onAddParticipant={onAddParticipant}
            onCreateBatch={onCreateBatch}
            onDeleteParticipant={onDeleteParticipant}
            onNavigate={onNavigate}
            onUpdateBatch={onUpdateBatch}
          />
        ) : (
          <DashboardPage activeRole={activeRole} onNavigate={onNavigate} role={role} />
        )}
      </main>
    </div>
  )
}

function DashboardPage({ activeRole, onNavigate, role }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            {role.subtitle}
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            {role.title} Dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Phase 1 mock dashboard for role-based navigation and layout validation.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <button
            onClick={() => onNavigate(`/${activeRole}/batches`)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Batches
          </button>
          <StatusPill icon={Clock3} label="Today" value="9:30 AM" />
          <StatusPill icon={Activity} label="Health" value="Stable" />
        </div>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {role.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Execution Snapshot" icon={BarChart3}>
          <div className="space-y-5">
            {role.pipeline.map((item) => (
              <ProgressRow key={item.label} item={item} />
            ))}
          </div>
        </Panel>

        <Panel title="Priority Focus" icon={Target}>
          <div className="space-y-3">
            {role.focus.map((item, index) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-black">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-zinc-300">{item}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Upcoming Sessions" icon={CalendarDays}>
          <div className="grid gap-3 sm:grid-cols-3">
            {['Design review', 'Live cohort', 'Weekly review'].map((item, index) => (
              <div
                key={item}
                className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Slot 0{index + 1}
                </p>
                <p className="mt-3 text-sm font-medium text-white">{item}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {index + 2}:00 PM - {index + 3}:00 PM
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent Activity" icon={ClipboardList}>
          <div className="space-y-3">
            {role.activity.map((item) => (
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

function MetricCard({ metric }) {
  const Icon = metric.icon

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-zinc-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-5 text-sm text-zinc-400">{metric.trend}</p>
    </article>
  )
}

function Panel({ children, icon: Icon, title }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black">
            <Icon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-zinc-400 outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label={`Open ${title}`}
          title={`Open ${title}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {children}
    </section>
  )
}

function ProgressRow({ item }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-300">{item.label}</span>
        <span className="font-medium text-white">{item.value}%</span>
      </div>
      <div className="h-2 rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-amber-300"
          style={{ width: `${item.value}%` }}
        />
      </div>
    </div>
  )
}

function StatusPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-cyan-300" />
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-sm font-medium text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}
