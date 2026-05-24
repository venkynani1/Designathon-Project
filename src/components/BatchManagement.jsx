import {
  ArrowLeft,
  Archive,
  Bell,
  CalendarDays,
  CalendarClock,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Save,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { batchTimelineSteps, lifecycleStatuses, trainingTypes } from '../data/mockData'
import {
  getBatchLifecycle as fetchBatchLifecycle,
  sendAssessmentReminder,
  sendAttendanceReminder,
  updateAssessmentScoreDeadline,
} from '../services/batchService'
import { getBatchHealth, getHealthBadgeClasses } from '../utils/attendanceEngine'
import {
  calculateBatchLifecycle,
  createAssessmentReminderLog,
  createAttendanceReminderLog,
} from '../utils/batchLifecycle'
import {
  BATCH_TYPES,
  MEETING_PLATFORMS,
  SCHEDULE_TYPES,
  TRAINER_TYPES,
  downloadBatchTemplate,
  downloadParticipantTemplate,
  parseBatchTemplate,
  parseParticipantTemplate,
} from '../utils/coordinatorBatchOperations'
import { AssessmentModule } from './AssessmentModule'
import { FeedbackModule } from './FeedbackModule'
import { ReportsModule } from './ReportsModule'
import { TeamsAttendanceUpload } from './uploads/TeamsAttendanceUpload'

const statusStyles = {
  Planned: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  Running: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  Completed: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Closed: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-200',
}

function createEmptyBatch() {
  const nextId = `MB-${Date.now().toString().slice(-5)}`

  return {
    batchId: nextId,
    trainingName: '',
    trainingType: 'Internal',
    startDate: '',
    endDate: '',
    scheduleType: 'All Days',
    customDates: '',
    timings: '',
    status: 'Planned',
    trainerType: 'External',
    trainerName: '',
    trainerEmail: '',
    trainerEmpId: '',
    trainerUnitOrCompetency: '',
    trainerPhone: '',
    trainerSpecialization: '',
    meetingPlatform: 'Teams',
    batchType: 'Internal/Mavericks',
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
    scheduleType: batch.scheduleType ?? 'All Days',
    customDates: batch.customDates ?? '',
    timings: batch.timings,
    status: batch.status,
    trainerType: batch.trainerType ?? 'External',
    trainerName: batch.trainer.name,
    trainerEmail: batch.trainer.email,
    trainerEmpId: batch.trainerEmpId ?? '',
    trainerUnitOrCompetency: batch.trainerUnitOrCompetency ?? batch.trainer.specialization ?? '',
    trainerPhone: batch.trainer.phone,
    trainerSpecialization: batch.trainer.specialization,
    meetingPlatform: batch.meetingPlatform ?? 'Teams',
    batchType: batch.batchType ?? getBatchType(batch),
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
    scheduleType: form.scheduleType,
    customDates: form.customDates,
    timings: form.timings,
    status: form.status,
    trainerType: form.trainerType,
    trainerEmpId: form.trainerEmpId,
    trainerUnitOrCompetency: form.trainerUnitOrCompetency,
    meetingPlatform: form.meetingPlatform,
    batchType: form.batchType,
    trainer: {
      name: form.trainerName,
      email: form.trainerEmail,
      phone: form.trainerPhone,
      specialization: form.trainerSpecialization || form.trainerUnitOrCompetency,
    },
    coordinatorSpoc: form.coordinatorSpoc,
    meetingLink: form.meetingLink,
    assessments: existingBatch?.assessments ?? [],
    feedback: existingBatch?.feedback ?? {
      triggeredAt: '',
      responses: [],
      summary: 'Feedback has not been uploaded yet.',
    },
    healthSnapshot: existingBatch?.healthSnapshot ?? {
      attendanceUploaded: false,
      highRisk: 0,
      mediumRisk: 0,
      assessmentClearance: 100,
    },
    participants: existingBatch?.participants ?? [],
    timeline: existingBatch?.timeline ?? getInitialTimeline(),
  }
}

function getInitialTimeline() {
  return batchTimelineSteps.reduce((timeline, step, index) => {
    timeline[step] = index === 0 ? 'completed' : 'pending'
    return timeline
  }, {})
}

function getBatchType(batch) {
  return batch.batchType ??
    (batch.trainingType === 'Internal' ? 'Internal/Mavericks' : 'External/Segue')
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
  logs,
  onAddParticipant,
  onCloseBatch,
  onCreateBatch,
  onDeleteParticipant,
  onLogEvent,
  onNavigate,
  onUpdateBatch,
}) {
  const selectedBatch = batchId ? batches.find((batch) => batch.batchId === batchId) : null
  const canManageBatches = ['admin', 'coordinator'].includes(activeRole)
  const canOperateAssignedBatch = ['admin', 'coordinator', 'trainer'].includes(activeRole)

  if (batchId) {
    return (
      <BatchDetailPage
        activeRole={activeRole}
        batch={selectedBatch}
        canManageBatches={canManageBatches}
        canOperateAssignedBatch={canOperateAssignedBatch}
        logs={logs}
        onBack={() => onNavigate(`/${activeRole}/batches`)}
        onCloseBatch={onCloseBatch}
        onLogEvent={onLogEvent}
        onUpdateBatch={onUpdateBatch}
      />
    )
  }

  return (
    <BatchListPage
      activeRole={activeRole}
      batches={batches}
      canManageBatches={canManageBatches}
      onAddParticipant={onAddParticipant}
      onCreateBatch={onCreateBatch}
      onCloseBatch={onCloseBatch}
      onDeleteParticipant={onDeleteParticipant}
      onNavigate={onNavigate}
      onUpdateBatch={onUpdateBatch}
    />
  )
}

function BatchListPage({
  activeRole,
  batches,
  canManageBatches,
  onAddParticipant,
  onCreateBatch,
  onCloseBatch,
  onDeleteParticipant,
  onNavigate,
  onUpdateBatch,
}) {
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
    <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            Batch Management
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Batches
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Create batches, upload batch and participant Excel files, and manage execution records.
          </p>
        </div>
        {canManageBatches ? (
          <button
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Plus className="h-4 w-4" />
            Create Batch
          </button>
        ) : null}
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {batchCounts.map((item) => (
          <div
            key={item.status}
            className="rounded-lg border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/20"
          >
            <StatusBadge status={item.status} />
            <p className="mt-3 text-2xl font-semibold text-white">{item.count}</p>
            <p className="mt-1 text-xs text-zinc-500">Lifecycle batches</p>
          </div>
        ))}
      </section>

      {formMode !== 'closed' && canManageBatches ? (
        <BatchForm
          form={form}
          mode={formMode}
          onCancel={closeForm}
          onChange={setForm}
          onDeleteParticipant={onDeleteParticipant}
          onSubmit={handleSubmit}
          onUpdateBatch={onUpdateBatch}
          selectedBatch={batches.find((batch) => batch.batchId === editingBatchId)}
        />
      ) : null}

      {canManageBatches ? (
        <CoordinatorBatchOperations
          batches={batches}
          onAddParticipant={onAddParticipant}
          onCloseBatch={onCloseBatch}
          onCreateBatch={onCreateBatch}
        />
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Batch Registry</h2>
        </div>
        <div>
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="w-[30%] px-4 py-3 font-medium">Batch</th>
                <th className="w-[20%] px-4 py-3 font-medium">Schedule</th>
                <th className="w-[16%] px-4 py-3 font-medium">Status</th>
                <th className="w-[18%] px-4 py-3 font-medium">Trainer</th>
                <th className="w-[8%] px-4 py-3 font-medium">People</th>
                <th className="w-[8%] px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {batches.length ? batches.map((batch) => {
                const health = getBatchHealth(batch)

                return (
                <tr key={batch.batchId} className="text-zinc-300">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{batch.trainingName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{batch.batchId} | {batch.trainingType}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-zinc-500" />
                      <span className="truncate">
                        {batch.startDate} to {batch.endDate}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {batch.timings}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={batch.status} />
                      <HealthBadge health={health} />
                    </div>
                  </td>
                  <td className="truncate px-4 py-3">{batch.trainer.name}</td>
                  <td className="px-4 py-3">{batch.participants.length}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigate(`/${activeRole}/batches/${batch.batchId}`)}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        View
                      </button>
                      {canManageBatches ? (
                        <button
                          onClick={() => openEditForm(batch)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                          aria-label={`Edit ${batch.batchId}`}
                          title={`Edit ${batch.batchId}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}) : (
                <tr>
                  <td colSpan="6" className="px-5 py-6 text-center text-zinc-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function BatchForm({
  form,
  mode,
  onCancel,
  onChange,
  onDeleteParticipant,
  onSubmit,
  onUpdateBatch,
  selectedBatch,
}) {
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        <SelectField
          label="Schedule type"
          options={SCHEDULE_TYPES}
          value={form.scheduleType}
          onChange={(value) => updateField('scheduleType', value)}
        />
        <TextField
          label="Custom dates"
          required={form.scheduleType === 'Custom Dates'}
          value={form.customDates}
          onChange={(value) => updateField('customDates', value)}
        />
        <TextField label="Timings" value={form.timings} onChange={(value) => updateField('timings', value)} />
        <SelectField
          label="Status"
          options={lifecycleStatuses}
          value={form.status}
          onChange={(value) => updateField('status', value)}
        />
        <SelectField
          label="Trainer type"
          options={TRAINER_TYPES}
          value={form.trainerType}
          onChange={(value) => updateField('trainerType', value)}
        />
        <TextField label="Trainer" value={form.trainerName} onChange={(value) => updateField('trainerName', value)} />
        <TextField
          label="Trainer email"
          type="email"
          required={form.trainerType === 'External'}
          value={form.trainerEmail}
          onChange={(value) => updateField('trainerEmail', value)}
        />
        <TextField
          label="Trainer Emp ID"
          required={form.trainerType === 'Hexavarsity'}
          value={form.trainerEmpId}
          onChange={(value) => updateField('trainerEmpId', value)}
        />
        <TextField
          label="Trainer unit/competency"
          required={form.trainerType === 'Hexavarsity'}
          value={form.trainerUnitOrCompetency}
          onChange={(value) => updateField('trainerUnitOrCompetency', value)}
        />
        <TextField
          label="Trainer phone"
          value={form.trainerPhone}
          onChange={(value) => updateField('trainerPhone', value)}
        />
        <TextField
          label="Trainer specialization"
          required={false}
          value={form.trainerSpecialization}
          onChange={(value) => updateField('trainerSpecialization', value)}
        />
        <SelectField
          label="Meeting platform"
          options={MEETING_PLATFORMS}
          value={form.meetingPlatform}
          onChange={(value) => updateField('meetingPlatform', value)}
        />
        <SelectField
          label="Batch type"
          options={BATCH_TYPES}
          value={form.batchType}
          onChange={(value) => {
            onChange({
              ...form,
              batchType: value,
              trainingType: value === 'Internal/Mavericks' ? 'Internal' : 'Segue',
            })
          }}
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

      {mode === 'edit' && selectedBatch ? (
        <InlineParticipantEditor
          batch={selectedBatch}
          onDeleteParticipant={onDeleteParticipant}
          onUpdateBatch={onUpdateBatch}
        />
      ) : null}

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

function InlineParticipantEditor({ batch, onDeleteParticipant, onUpdateBatch }) {
  const [participantForm, setParticipantForm] = useState(() => getEmptyParticipant(batch.trainingType))
  const [editingParticipantId, setEditingParticipantId] = useState('')
  const isInternal = batch.trainingType === 'Internal'

  const updateField = (field, value) => {
    setParticipantForm((current) => ({ ...current, [field]: value }))
  }

  const resetForm = () => {
    setParticipantForm(getEmptyParticipant(batch.trainingType))
    setEditingParticipantId('')
  }

  const saveParticipant = () => {
    const nextParticipant = {
      id: editingParticipantId || `${isInternal ? 'EMP' : 'EXT'}-${Date.now().toString().slice(-5)}`,
      ...participantForm,
    }
    const participants = editingParticipantId
      ? batch.participants.map((participant) =>
          participant.id === editingParticipantId ? nextParticipant : participant,
        )
      : [...batch.participants, nextParticipant]

    onUpdateBatch(batch.batchId, { ...batch, participants })
    resetForm()
  }

  const editParticipant = (participant) => {
    setEditingParticipantId(participant.id)
    setParticipantForm(
      isInternal
        ? {
            empId: participant.empId ?? '',
            empName: participant.empName ?? '',
            officialEmail: participant.officialEmail ?? '',
          }
        : {
            name: participant.name ?? '',
            email: participant.email ?? '',
            mobileNumber: participant.mobileNumber ?? '',
          },
    )
  }

  return (
    <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Participants</h3>
          <p className="mt-1 text-xs text-zinc-500">Add, edit, or remove participants for this batch.</p>
        </div>
        {editingParticipantId ? (
          <button
            type="button"
            onClick={resetForm}
            className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
          >
            Cancel participant edit
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {isInternal ? (
          <>
            <TextField label="EMP_ID" value={participantForm.empId} onChange={(value) => updateField('empId', value)} />
            <TextField label="EMP_NAME" value={participantForm.empName} onChange={(value) => updateField('empName', value)} />
            <TextField
              label="Official email"
              type="email"
              value={participantForm.officialEmail}
              onChange={(value) => updateField('officialEmail', value)}
            />
          </>
        ) : (
          <>
            <TextField label="Name" value={participantForm.name} onChange={(value) => updateField('name', value)} />
            <TextField label="Email" type="email" value={participantForm.email} onChange={(value) => updateField('email', value)} />
            <TextField
              label="Mobile number"
              value={participantForm.mobileNumber}
              onChange={(value) => updateField('mobileNumber', value)}
            />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={saveParticipant}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <UserPlus className="h-4 w-4" />
        {editingParticipantId ? 'Save participant' : 'Add participant'}
      </button>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {batch.participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {isInternal ? participant.empName : participant.name}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {isInternal ? participant.empId : participant.email}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => editParticipant(participant)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label="Edit participant"
                title="Edit participant"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteParticipant(batch.batchId, participant.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label="Remove participant"
                title="Remove participant"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CoordinatorBatchOperations({
  batches,
  onAddParticipant,
  onCloseBatch,
  onCreateBatch,
}) {
  const [batchMessage, setBatchMessage] = useState('')
  const [participantMessage, setParticipantMessage] = useState('')
  const [batchFileName, setBatchFileName] = useState('')
  const [participantFileName, setParticipantFileName] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.batchId ?? '')
  const selectedBatch = batches.find((batch) => batch.batchId === selectedBatchId) ?? batches[0]
  const selectedBatchType = selectedBatch ? getBatchType(selectedBatch) : 'Internal/Mavericks'

  const handleBatchFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBatchFileName(file.name)

    try {
      const rows = await parseBatchTemplate(file)
      const validRows = rows.filter((row) => !row.errors.length)

      for (const row of validRows) {
        await onCreateBatch(row.batch)
      }

      const invalidCount = rows.length - validRows.length
      setBatchMessage(
        `${validRows.length} batch${validRows.length === 1 ? '' : 'es'} created${
          invalidCount ? `; ${invalidCount} row${invalidCount === 1 ? '' : 's'} skipped.` : '.'
        }`,
      )
    } catch (error) {
      setBatchMessage(error.message || 'Unable to parse batch template.')
    } finally {
      event.target.value = ''
    }
  }

  const handleParticipantFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedBatch) return
    setParticipantFileName(file.name)

    try {
      const rows = await parseParticipantTemplate(file, selectedBatchType)
      const validRows = rows.filter((row) => !row.errors.length)

      for (const row of validRows) {
        await onAddParticipant(selectedBatch.batchId, row.participant)
      }

      const invalidCount = rows.length - validRows.length
      setParticipantMessage(
        `${validRows.length} participant${validRows.length === 1 ? '' : 's'} added to ${selectedBatch.batchId}${
          invalidCount ? `; ${invalidCount} row${invalidCount === 1 ? '' : 's'} skipped.` : '.'
        }`,
      )
    } catch (error) {
      setParticipantMessage(error.message || 'Unable to parse participant template.')
    } finally {
      event.target.value = ''
    }
  }

  const closeSelectedBatch = async () => {
    if (!selectedBatch) return
    try {
      await onCloseBatch(selectedBatch.batchId)
      setParticipantMessage(`Batch ${selectedBatch.batchId} close requested.`)
    } catch (error) {
      setParticipantMessage(error.message || 'Batch is not ready to close.')
    }
  }

  return (
    <section className="mt-5 grid gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Batch Excel Upload</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Upload a completed batch template. Valid rows are created immediately.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={downloadBatchTemplate}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Download className="h-4 w-4" />
            Download Batch Template
          </button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300">
            <Upload className="h-4 w-4" />
            Upload Batch Excel
            <input type="file" accept=".xlsx" className="sr-only" onChange={handleBatchFile} />
          </label>
        </div>
        {batchFileName ? <p className="mt-3 text-xs text-zinc-500">Selected: {batchFileName}</p> : null}
        {batchMessage ? <p className="mt-3 text-sm text-cyan-200">{batchMessage}</p> : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Participant Upload</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Select a batch, upload its participant Excel, and map valid rows to that batch.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
              Selected batch
            </span>
            <select
              value={selectedBatch?.batchId ?? ''}
              onChange={(event) => {
                setSelectedBatchId(event.target.value)
                setParticipantMessage('')
                setParticipantFileName('')
              }}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            >
              {batches.map((batch) => (
                <option key={batch.batchId} value={batch.batchId}>
                  {batch.batchId} - {batch.trainingName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row lg:self-end">
            <button
              type="button"
              onClick={() => downloadParticipantTemplate(selectedBatchType)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <Download className="h-4 w-4" />
              Template
            </button>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300">
              <Upload className="h-4 w-4" />
              Upload Participants
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                disabled={!selectedBatch}
                onChange={handleParticipantFile}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-300">
            {selectedBatchType}
          </span>
          {selectedBatch ? <StatusBadge status={selectedBatch.status} /> : null}
          <button
            type="button"
            onClick={closeSelectedBatch}
            disabled={!selectedBatch || selectedBatch.status === 'Closed'}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:text-zinc-600"
          >
            <Archive className="h-3.5 w-3.5" />
            Close Batch
          </button>
        </div>

        {participantFileName ? <p className="mt-3 text-xs text-zinc-500">Selected: {participantFileName}</p> : null}
        {participantMessage ? <p className="mt-3 text-sm text-cyan-200">{participantMessage}</p> : null}
      </div>
    </section>
  )
}

function BatchDetailPage({
  activeRole,
  batch,
  canManageBatches,
  canOperateAssignedBatch,
  logs,
  onBack,
  onCloseBatch,
  onLogEvent,
  onUpdateBatch,
}) {
  const health = batch ? getBatchHealth(batch) : null

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

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-8">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to batches
      </button>

      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <StatusBadge status={batch.status} />
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">
              {batch.trainingType}
            </span>
            <HealthBadge health={health} />
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
            {batch.batchId}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            {batch.trainingName}
          </h1>
        </div>
        {batch.meetingLink ? (
          <a
            href={batch.meetingLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Video className="h-4 w-4" />
            Open meeting
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </header>

      <section className="mt-5 grid gap-4">
        <SummaryPanel batch={batch} health={health} />
        <CoordinatorLifecycleTimeline
          batch={batch}
          canManage={canManageBatches}
          logs={logs}
          onCloseBatch={onCloseBatch}
          onLogEvent={onLogEvent}
          onUpdateBatch={onUpdateBatch}
        />
      </section>

      <SectionNavigation activeRole={activeRole} />

      <div id="attendance">
        <TeamsAttendanceUpload
          key={batch.batchId}
          batch={batch}
          canEdit={canOperateAssignedBatch}
          onLogEvent={onLogEvent}
        />
      </div>

      <div id="assessments">
        <AssessmentModule
          batch={batch}
          canEdit={canOperateAssignedBatch}
          onLogEvent={onLogEvent}
          onUpdateBatch={onUpdateBatch}
        />
      </div>

      {activeRole !== 'trainer' ? (
        <div id="feedback">
          <FeedbackModule
            batch={batch}
            canEdit={canOperateAssignedBatch}
            onLogEvent={onLogEvent}
            onUpdateBatch={onUpdateBatch}
          />
        </div>
      ) : null}

      {activeRole !== 'participant' ? (
        <div id="reports">
          <ReportsModule
            assessmentOnly={activeRole === 'trainer'}
            batch={batch}
            onLogEvent={onLogEvent}
          />
        </div>
      ) : null}
    </div>
  )
}

function SectionNavigation({ activeRole }) {
  const sections = [
    ['attendance', 'Attendance'],
    ['assessments', 'Assessments'],
    ...(activeRole === 'trainer' ? [] : [['feedback', 'Feedback']]),
    ...(activeRole === 'participant' ? [] : [['reports', 'Reports']]),
  ]

  return (
    <nav className="mt-6 flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.045] p-2">
      {sections.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          className="min-w-fit rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

function SummaryPanel({ batch, health }) {
  const summaryItems = [
    { label: 'Health', value: health.level, detail: health.reason },
    { label: 'Start date', value: batch.startDate },
    { label: 'End date', value: batch.endDate },
    { label: 'Timings', value: batch.timings },
    { label: 'Coordinator/SPOC', value: batch.coordinatorSpoc },
    { label: 'Meeting link', value: batch.meetingLink || 'Not set' },
    { label: 'Participants', value: batch.participants.length },
  ]

  return (
    <Panel title="Batch Summary">
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        {summaryItems.map((item) => (
          <div key={item.label} className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{item.label}</p>
            {item.label === 'Health' ? (
              <div className="mt-2">
                <HealthBadge health={health} />
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">{item.detail}</p>
              </div>
            ) : (
              <p className="mt-2 truncate text-sm font-medium text-white">{item.value}</p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function CoordinatorLifecycleTimeline({
  batch,
  canManage,
  logs,
  onCloseBatch,
  onLogEvent,
  onUpdateBatch,
}) {
  const [apiLifecycle, setApiLifecycle] = useState(null)
  const [deadline, setDeadline] = useState(batch.assessmentScoreDeadline?.slice(0, 16) ?? '')
  const [message, setMessage] = useState('')
  const lifecycle = apiLifecycle ?? calculateBatchLifecycle(batch, logs)

  useEffect(() => {
    let isMounted = true

    fetchBatchLifecycle(batch.batchId)
      .then((nextLifecycle) => {
        if (isMounted) setApiLifecycle(nextLifecycle)
      })
      .catch((error) => {
        console.warn('Backend lifecycle unavailable; using local lifecycle fallback.', error)
        if (isMounted) setApiLifecycle(null)
      })

    return () => {
      isMounted = false
    }
  }, [batch.batchId, batch, logs])

  const saveDeadline = async () => {
    if (!deadline) {
      setMessage('Select an assessment score deadline.')
      return
    }

    const deadlineIso = new Date(deadline).toISOString()

    try {
      const updatedBatch = await updateAssessmentScoreDeadline(batch.batchId, deadlineIso)
      onUpdateBatch(batch.batchId, { ...batch, ...updatedBatch, assessmentScoreDeadline: deadlineIso })
      setMessage('Assessment score deadline saved.')
    } catch (error) {
      console.warn('Backend deadline update failed; keeping local fallback state.', error)
      onUpdateBatch(batch.batchId, { ...batch, assessmentScoreDeadline: deadlineIso })
      setMessage('Assessment score deadline saved locally.')
    }
  }

  const sendReminder = async (type) => {
    const log =
      type === 'attendance'
        ? createAttendanceReminderLog(batch, batch.startDate)
        : createAssessmentReminderLog(batch)

    try {
      // TODO: implement real email reminder later.
      if (type === 'attendance') {
        await sendAttendanceReminder(batch.batchId, batch.startDate)
      } else {
        await sendAssessmentReminder(batch.batchId)
      }
    } catch (error) {
      console.warn('Backend reminder failed; using local log fallback.', error)
    }

    onLogEvent?.(log)
    setMessage(type === 'attendance' ? 'Mock attendance reminder sent.' : 'Mock assessment reminder sent.')
  }

  const closeBatch = async () => {
    try {
      await onCloseBatch(batch.batchId)
      setMessage('Batch close requested.')
    } catch (error) {
      setMessage(error.message || 'Batch is not ready to close.')
    }
  }

  return (
    <Panel title="Coordinator Lifecycle">
      {message ? <p className="mb-4 text-sm text-cyan-200">{message}</p> : null}

      <div className="grid gap-3 xl:grid-cols-3">
        {lifecycle.steps.map((step) => (
          <LifecycleStepCard
            key={step.id}
            canManage={canManage}
            deadline={deadline}
            onCloseBatch={closeBatch}
            onDeadlineChange={setDeadline}
            onReminder={sendReminder}
            onSaveDeadline={saveDeadline}
            step={step}
          />
        ))}
      </div>
    </Panel>
  )
}

function LifecycleStepCard({
  canManage,
  deadline,
  onCloseBatch,
  onDeadlineChange,
  onReminder,
  onSaveDeadline,
  step,
}) {
  const tone = getLifecycleTone(step.status)

  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${tone}`}>
            {step.number}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{step.title}</h3>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
                {step.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{step.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Last updated: {step.lastUpdatedAt ? new Date(step.lastUpdatedAt).toLocaleString() : 'Not available'}
            </p>
          </div>
        </div>

        {canManage ? (
          <LifecycleAction
            deadline={deadline}
            onCloseBatch={onCloseBatch}
            onDeadlineChange={onDeadlineChange}
            onReminder={onReminder}
            onSaveDeadline={onSaveDeadline}
            step={step}
          />
        ) : null}
      </div>
    </article>
  )
}

function LifecycleAction({
  deadline,
  onCloseBatch,
  onDeadlineChange,
  onReminder,
  onSaveDeadline,
  step,
}) {
  if (step.id === 'attendance_uploaded') {
    return (
      <button
        type="button"
        onClick={() => onReminder('attendance')}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Bell className="h-4 w-4" />
        Send Reminder
      </button>
    )
  }

  if (step.id === 'assessment_scores_uploaded') {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="block">
          <span className="sr-only">Assessment score deadline</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(event) => onDeadlineChange(event.target.value)}
            className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
          />
        </label>
        <button
          type="button"
          onClick={onSaveDeadline}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <CalendarClock className="h-4 w-4" />
          Save
        </button>
        <button
          type="button"
          onClick={() => onReminder('assessment')}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Bell className="h-4 w-4" />
          Remind
        </button>
      </div>
    )
  }

  if (step.id === 'batch_closed' && step.status === 'Ready To Close') {
    return (
      <button
        type="button"
        onClick={onCloseBatch}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Archive className="h-4 w-4" />
        Close Batch
      </button>
    )
  }

  return null
}

function getLifecycleTone(status) {
  if (['Completed', 'Uploaded On Time', 'Uploaded Before Deadline', 'Summary Available', 'Closed'].includes(status)) {
    return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
  }

  if (['Uploaded Late', 'Reminder Triggered', 'Overdue', 'Missing'].includes(status)) {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  }

  if (['Ready To Close', 'Report Exported', 'Topper Identified', 'Responses Uploaded', 'Triggered', 'Assessment Created'].includes(status)) {
    return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
  }

  return 'border-white/10 bg-white/[0.04] text-zinc-300'
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

function HealthBadge({ health }) {
  if (!health) return null

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getHealthBadgeClasses(health.tone)}`}
      title={health.reason}
    >
      {health.level}
    </span>
  )
}

function TextField({ label, onChange, required = true, type = 'text', value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <input
        required={required}
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
