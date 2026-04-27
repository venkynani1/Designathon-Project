import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  Link as LinkIcon,
  Mail,
  Phone,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { batchTimelineSteps, lifecycleStatuses, trainingTypes } from '../data/mockData'

const statusStyles = {
  Planned: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  Running: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  Completed: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Closed: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-200',
}

const timelineStyles = {
  done: 'border-emerald-300 bg-emerald-300 text-black',
  current: 'border-cyan-300 bg-cyan-300 text-black',
  pending: 'border-white/15 bg-white/[0.04] text-zinc-500',
}

function createEmptyBatch() {
  const nextId = `MB-${Date.now().toString().slice(-5)}`

  return {
    batchId: nextId,
    trainingName: '',
    trainingType: 'Internal',
    startDate: '',
    endDate: '',
    timings: '',
    status: 'Planned',
    trainerName: '',
    trainerEmail: '',
    trainerPhone: '',
    trainerSpecialization: '',
    coordinatorSpoc: '',
    meetingLink: '',
  }
}

function batchToForm(batch) {
  return {
    batchId: batch.batchId,
    trainingName: batch.trainingName,
    trainingType: batch.trainingType,
    startDate: batch.startDate,
    endDate: batch.endDate,
    timings: batch.timings,
    status: batch.status,
    trainerName: batch.trainer.name,
    trainerEmail: batch.trainer.email,
    trainerPhone: batch.trainer.phone,
    trainerSpecialization: batch.trainer.specialization,
    coordinatorSpoc: batch.coordinatorSpoc,
    meetingLink: batch.meetingLink,
  }
}

function formToBatch(form, existingBatch) {
  return {
    id: existingBatch?.id ?? form.batchId,
    batchId: form.batchId,
    trainingName: form.trainingName,
    trainingType: form.trainingType,
    startDate: form.startDate,
    endDate: form.endDate,
    timings: form.timings,
    status: form.status,
    trainer: {
      name: form.trainerName,
      email: form.trainerEmail,
      phone: form.trainerPhone,
      specialization: form.trainerSpecialization,
    },
    coordinatorSpoc: form.coordinatorSpoc,
    meetingLink: form.meetingLink,
    participants: existingBatch?.participants ?? [],
    timeline: existingBatch?.timeline ?? getInitialTimeline(),
  }
}

function getInitialTimeline() {
  return batchTimelineSteps.reduce((timeline, step, index) => {
    timeline[step] = index === 0 ? 'done' : 'pending'
    return timeline
  }, {})
}

function getEmptyParticipant(trainingType) {
  if (trainingType === 'Internal') {
    return {
      empId: '',
      empName: '',
      officialEmail: '',
    }
  }

  return {
    name: '',
    email: '',
    mobileNumber: '',
  }
}

export function BatchManagement({
  activeRole,
  batchId,
  batches,
  onAddParticipant,
  onCreateBatch,
  onDeleteParticipant,
  onNavigate,
  onUpdateBatch,
}) {
  const selectedBatch = batchId ? batches.find((batch) => batch.batchId === batchId) : null

  if (batchId) {
    return (
      <BatchDetailPage
        activeRole={activeRole}
        batch={selectedBatch}
        onAddParticipant={onAddParticipant}
        onBack={() => onNavigate(`/${activeRole}/batches`)}
        onDeleteParticipant={onDeleteParticipant}
      />
    )
  }

  return (
    <BatchListPage
      activeRole={activeRole}
      batches={batches}
      onCreateBatch={onCreateBatch}
      onNavigate={onNavigate}
      onUpdateBatch={onUpdateBatch}
    />
  )
}

function BatchListPage({ activeRole, batches, onCreateBatch, onNavigate, onUpdateBatch }) {
  const [formMode, setFormMode] = useState('closed')
  const [editingBatchId, setEditingBatchId] = useState(null)
  const [form, setForm] = useState(createEmptyBatch)

  const batchCounts = useMemo(
    () =>
      lifecycleStatuses.map((status) => ({
        status,
        count: batches.filter((batch) => batch.status === status).length,
      })),
    [batches],
  )

  const openCreateForm = () => {
    setEditingBatchId(null)
    setForm(createEmptyBatch())
    setFormMode('create')
  }

  const openEditForm = (batch) => {
    setEditingBatchId(batch.batchId)
    setForm(batchToForm(batch))
    setFormMode('edit')
  }

  const closeForm = () => {
    setEditingBatchId(null)
    setFormMode('closed')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const existingBatch = batches.find((batch) => batch.batchId === editingBatchId)
    const nextBatch = formToBatch(form, existingBatch)

    if (formMode === 'edit') {
      onUpdateBatch(editingBatchId, nextBatch)
    } else {
      onCreateBatch(nextBatch)
    }

    closeForm()
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            Batch Management
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Batches and Candidates
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Manage sanitized mock batches, lifecycle states, trainer assignment, and batch-level participants.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Plus className="h-4 w-4" />
          Create batch
        </button>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {batchCounts.map((item) => (
          <div
            key={item.status}
            className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20"
          >
            <StatusBadge status={item.status} />
            <p className="mt-4 text-3xl font-semibold text-white">{item.count}</p>
            <p className="mt-1 text-sm text-zinc-500">Lifecycle batches</p>
          </div>
        ))}
      </section>

      {formMode !== 'closed' ? (
        <BatchForm
          form={form}
          mode={formMode}
          onCancel={closeForm}
          onChange={setForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      <section className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Batch Registry</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-5 py-4 font-medium">Batch</th>
                <th className="px-5 py-4 font-medium">Training</th>
                <th className="px-5 py-4 font-medium">Type</th>
                <th className="px-5 py-4 font-medium">Schedule</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Trainer</th>
                <th className="px-5 py-4 font-medium">Candidates</th>
                <th className="px-5 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {batches.map((batch) => (
                <tr key={batch.batchId} className="text-zinc-300">
                  <td className="px-5 py-4 font-medium text-white">{batch.batchId}</td>
                  <td className="px-5 py-4">{batch.trainingName}</td>
                  <td className="px-5 py-4">{batch.trainingType}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-zinc-500" />
                      <span>
                        {batch.startDate} to {batch.endDate}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {batch.timings}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-5 py-4">{batch.trainer.name}</td>
                  <td className="px-5 py-4">{batch.participants.length}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigate(`/${activeRole}/batches/${batch.batchId}`)}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openEditForm(batch)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                        aria-label={`Edit ${batch.batchId}`}
                        title={`Edit ${batch.batchId}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function BatchForm({ form, mode, onCancel, onChange, onSubmit }) {
  const updateField = (field, value) => onChange({ ...form, [field]: value })

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            {mode === 'edit' ? 'Edit batch' : 'Create batch'}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {mode === 'edit' ? form.batchId : 'New batch setup'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-zinc-400 outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label="Close batch form"
          title="Close batch form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField label="Batch ID" value={form.batchId} onChange={(value) => updateField('batchId', value)} />
        <TextField
          label="Training name"
          value={form.trainingName}
          onChange={(value) => updateField('trainingName', value)}
        />
        <SelectField
          label="Training type"
          options={trainingTypes}
          value={form.trainingType}
          onChange={(value) => updateField('trainingType', value)}
        />
        <TextField
          label="Start date"
          type="date"
          value={form.startDate}
          onChange={(value) => updateField('startDate', value)}
        />
        <TextField
          label="End date"
          type="date"
          value={form.endDate}
          onChange={(value) => updateField('endDate', value)}
        />
        <TextField label="Timings" value={form.timings} onChange={(value) => updateField('timings', value)} />
        <SelectField
          label="Status"
          options={lifecycleStatuses}
          value={form.status}
          onChange={(value) => updateField('status', value)}
        />
        <TextField label="Trainer" value={form.trainerName} onChange={(value) => updateField('trainerName', value)} />
        <TextField
          label="Trainer email"
          type="email"
          value={form.trainerEmail}
          onChange={(value) => updateField('trainerEmail', value)}
        />
        <TextField
          label="Trainer phone"
          value={form.trainerPhone}
          onChange={(value) => updateField('trainerPhone', value)}
        />
        <TextField
          label="Trainer specialization"
          value={form.trainerSpecialization}
          onChange={(value) => updateField('trainerSpecialization', value)}
        />
        <TextField
          label="Coordinator/SPOC"
          value={form.coordinatorSpoc}
          onChange={(value) => updateField('coordinatorSpoc', value)}
        />
        <TextField
          label="Meeting link"
          type="url"
          value={form.meetingLink}
          onChange={(value) => updateField('meetingLink', value)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Save className="h-4 w-4" />
          Save batch
        </button>
      </div>
    </form>
  )
}

function BatchDetailPage({ activeRole, batch, onAddParticipant, onBack, onDeleteParticipant }) {
  const [participantForm, setParticipantForm] = useState(() =>
    getEmptyParticipant(batch?.trainingType ?? 'Internal'),
  )

  if (!batch) {
    return (
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to batches
        </button>
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6">
          <h1 className="text-2xl font-semibold text-white">Batch not found</h1>
          <p className="mt-2 text-sm text-zinc-400">
            The selected batch route does not match the current registry.
          </p>
        </div>
      </div>
    )
  }

  const updateParticipantField = (field, value) => {
    setParticipantForm({ ...participantForm, [field]: value })
  }

  const handleParticipantSubmit = (event) => {
    event.preventDefault()
    onAddParticipant(batch.batchId, {
      id: `${batch.trainingType === 'Internal' ? 'EMP' : 'EXT'}-${Date.now().toString().slice(-5)}`,
      ...participantForm,
    })
    setParticipantForm(getEmptyParticipant(batch.trainingType))
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to batches
      </button>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <StatusBadge status={batch.status} />
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">
              {batch.trainingType}
            </span>
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            {batch.batchId}
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            {batch.trainingName}
          </h1>
        </div>
        <a
          href={batch.meetingLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Video className="h-4 w-4" />
          Open meeting
          <ExternalLink className="h-4 w-4" />
        </a>
      </header>

      <section className="mt-8 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <SummaryPanel batch={batch} />
        <BatchTimelineView timeline={batch.timeline} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <TrainerPanel batch={batch} />
        <ParticipantPanel
          activeRole={activeRole}
          batch={batch}
          form={participantForm}
          onDeleteParticipant={onDeleteParticipant}
          onFieldChange={updateParticipantField}
          onSubmit={handleParticipantSubmit}
        />
      </section>
    </div>
  )
}

function SummaryPanel({ batch }) {
  const summaryItems = [
    { label: 'Start date', value: batch.startDate, icon: CalendarDays },
    { label: 'End date', value: batch.endDate, icon: CalendarDays },
    { label: 'Timings', value: batch.timings, icon: Clock3 },
    { label: 'Coordinator/SPOC', value: batch.coordinatorSpoc, icon: Users },
    { label: 'Meeting link', value: batch.meetingLink, icon: LinkIcon },
    { label: 'Participants', value: batch.participants.length, icon: UserPlus },
  ]

  return (
    <Panel title="Batch Summary">
      <div className="grid gap-3 sm:grid-cols-2">
        {summaryItems.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.label} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <Icon className="mb-3 h-4 w-4 text-cyan-300" />
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{item.label}</p>
              <p className="mt-2 break-words text-sm font-medium text-white">{item.value}</p>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function TrainerPanel({ batch }) {
  return (
    <Panel title="Trainer Details">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xl font-semibold text-white">{batch.trainer.name}</p>
        <p className="mt-2 text-sm text-zinc-400">{batch.trainer.specialization}</p>
        <div className="mt-5 space-y-3 text-sm text-zinc-300">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-cyan-300" />
            {batch.trainer.email}
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-cyan-300" />
            {batch.trainer.phone}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function BatchTimelineView({ timeline }) {
  return (
    <Panel title="Batch Timeline View">
      <div className="grid gap-3 md:grid-cols-2">
        {batchTimelineSteps.map((step, index) => {
          const state = timeline[step] ?? 'pending'

          return (
            <div key={step} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-4">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${timelineStyles[state]}`}
              >
                {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{step}</p>
                <p className="mt-1 text-xs capitalize text-zinc-500">{state}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function ParticipantPanel({
  activeRole,
  batch,
  form,
  onDeleteParticipant,
  onFieldChange,
  onSubmit,
}) {
  const isInternal = batch.trainingType === 'Internal'

  return (
    <Panel title="Participant Management">
      <form onSubmit={onSubmit} className="mb-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {isInternal ? (
            <>
              <TextField label="EMP_ID" value={form.empId} onChange={(value) => onFieldChange('empId', value)} />
              <TextField label="EMP_NAME" value={form.empName} onChange={(value) => onFieldChange('empName', value)} />
              <TextField
                label="Official email"
                type="email"
                value={form.officialEmail}
                onChange={(value) => onFieldChange('officialEmail', value)}
              />
            </>
          ) : (
            <>
              <TextField label="Name" value={form.name} onChange={(value) => onFieldChange('name', value)} />
              <TextField label="Email" type="email" value={form.email} onChange={(value) => onFieldChange('email', value)} />
              <TextField
                label="Mobile number"
                value={form.mobileNumber}
                onChange={(value) => onFieldChange('mobileNumber', value)}
              />
            </>
          )}
        </div>
        <button
          type="submit"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <UserPlus className="h-4 w-4" />
          Add participant
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              {isInternal ? (
                <>
                  <th className="px-4 py-3 font-medium">EMP_ID</th>
                  <th className="px-4 py-3 font-medium">EMP_NAME</th>
                  <th className="px-4 py-3 font-medium">Official email</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Mobile number</th>
                </>
              )}
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {batch.participants.map((participant) => (
              <tr key={participant.id} className="text-zinc-300">
                {isInternal ? (
                  <>
                    <td className="px-4 py-3 font-medium text-white">{participant.empId}</td>
                    <td className="px-4 py-3">{participant.empName}</td>
                    <td className="px-4 py-3">{participant.officialEmail}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-white">{participant.name}</td>
                    <td className="px-4 py-3">{participant.email}</td>
                    <td className="px-4 py-3">{participant.mobileNumber}</td>
                  </>
                )}
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDeleteParticipant(batch.batchId, participant.id, activeRole)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                    aria-label="Remove participant"
                    title="Remove participant"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Panel({ children, title }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <h2 className="mb-5 text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}

function TextField({ label, onChange, type = 'text', value }) {
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

function SelectField({ label, onChange, options, value }) {
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
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
