import { Download, FileSpreadsheet, Plus, Trophy, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  createAssessmentRecord,
  createAssessmentEvidence,
  deleteAssessmentEvidence,
  getAssessmentStatsRecord,
  getAssessmentToppers,
  listAssessments,
  updateAssessmentRecord,
  uploadAssessmentResults,
} from '../services/assessmentService'
import { sendAssessmentReminder as sendAssessmentReminderEmail } from '../services/batchService'
import {
  calculateTopper,
  downloadAssessmentTemplate,
  getAssessmentStats,
  parseAssessmentUpload,
} from '../utils/assessmentEngine'
import {
  createAssessmentUploadNotification,
  createLogEntry,
  resolveParticipantRecipientEmail,
} from '../utils/notificationEngine'

const assessmentTypes = ['Sprint Review', 'API Assessment', 'Coding Assessment', 'Project Evaluation']

function createEmptyAssessment() {
  return {
    name: '',
    type: 'Sprint Review',
    date: '',
    cutoffScore: 70,
    maxScore: 100,
    remarks: '',
    weightage: 100,
  }
}

export function AssessmentModule({
  batch,
  canConfigure = canEdit,
  canEdit,
  canManageDocuments = false,
  canUploadEvidence = false,
  canSendReminders = false,
  onLogEvent,
  onUpdateBatch,
}) {
  const [form, setForm] = useState(createEmptyAssessment)
  const [message, setMessage] = useState('')
  const [apiAssessments, setApiAssessments] = useState(null)
  const [apiAssessmentBatchId, setApiAssessmentBatchId] = useState('')
  const [localAssessmentState, setLocalAssessmentState] = useState(null)
  const [assessmentDataMode, setAssessmentDataMode] = useState('local')
  const [apiStats, setApiStats] = useState(null)
  const [apiToppers, setApiToppers] = useState(null)
  const [reminderSendingId, setReminderSendingId] = useState('')
  const [reminderDelivery, setReminderDelivery] = useState(null)
  const hasApiAssessments =
    assessmentDataMode === 'api' &&
    apiAssessmentBatchId === batch.batchId &&
    Array.isArray(apiAssessments)
  const hasLocalAssessmentState = localAssessmentState?.batchId === batch.batchId
  const assessments = useMemo(
    () =>
      hasApiAssessments
        ? apiAssessments
        : hasLocalAssessmentState
          ? localAssessmentState.assessments
          : batch.assessments ?? [],
    [
      apiAssessments,
      batch.assessments,
      hasApiAssessments,
      hasLocalAssessmentState,
      localAssessmentState,
    ],
  )
  const effectiveBatch = useMemo(
    () => ({
      ...batch,
      assessments,
    }),
    [assessments, batch],
  )
  const localStats = useMemo(() => getAssessmentStats(effectiveBatch), [effectiveBatch])
  const localToppers = useMemo(() => calculateTopper(effectiveBatch), [effectiveBatch])
  const stats = assessmentDataMode === 'api' && apiStats ? apiStats : localStats
  const toppers = assessmentDataMode === 'api' && apiToppers ? apiToppers : localToppers
  const reminderRecipientEmails = (batch.participants ?? [])
    .map((participant) => resolveParticipantRecipientEmail(participant))
    .filter(Boolean)

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  useEffect(() => {
    let isMounted = true

    listAssessments(batch.batchId)
      .then(async (backendAssessments) => {
        if (!isMounted) return

        const [nextStats, nextToppers] = await Promise.all([
          getAssessmentStatsRecord(batch.batchId),
          getAssessmentToppers(batch.batchId),
        ])

        if (!isMounted) return

        setApiAssessments(backendAssessments)
        setApiAssessmentBatchId(batch.batchId)
        setApiStats(nextStats)
        setApiToppers(nextToppers)
        setAssessmentDataMode('api')
      })
      .catch((error) => {
        console.warn('Backend assessments unavailable; using batch-state fallback.', error)
        if (isMounted) setAssessmentDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [batch.batchId, batch.assessments])

  const refreshApiAssessmentSignals = async () => {
    const [nextStats, nextToppers] = await Promise.all([
      getAssessmentStatsRecord(batch.batchId),
      getAssessmentToppers(batch.batchId),
    ])

    setApiStats(nextStats)
    setApiToppers(nextToppers)
  }

  const saveLocalAssessments = (nextAssessments, logs = []) => {
    setLocalAssessmentState({
      batchId: batch.batchId,
      assessments: nextAssessments,
    })
    onUpdateBatch(batch.batchId, {
      ...batch,
      assessments: nextAssessments,
    })
    if (logs.length) onLogEvent?.(logs)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const assessment = {
      id: `ASM-${Date.now().toString().slice(-6)}`,
      ...form,
      cutoffScore: Number(form.cutoffScore),
      maxScore: Number(form.maxScore),
      weightage: Number(form.weightage),
      results: [],
      createdAt: new Date().toISOString(),
    }
    const logs = [
      createLogEntry({
        action: 'assessment_created',
        batchId: batch.batchId,
        message: `Assessment ${assessment.name} created for ${batch.trainingName}.`,
      }),
    ]

    if (assessmentDataMode === 'api') {
      try {
        const persistedAssessment = await createAssessmentRecord(batch.batchId, assessment)
        const nextAssessments = [...(apiAssessments ?? assessments), persistedAssessment]
        setApiAssessments(nextAssessments)
        setApiAssessmentBatchId(batch.batchId)
        await refreshApiAssessmentSignals()
        onUpdateBatch(batch.batchId, {
          ...batch,
          assessments: nextAssessments,
        })
        onLogEvent?.(logs)
        setForm(createEmptyAssessment())
        setMessage('Assessment setup saved.')
        return
      } catch (error) {
        console.warn('Backend assessment create failed; using batch-state fallback.', error)
        setAssessmentDataMode('local')
      }
    }

    saveLocalAssessments([...assessments, assessment], logs)
    setForm(createEmptyAssessment())
    setMessage('Assessment setup saved.')
  }

  const handleQuestionFile = async (event, assessmentId) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select an assessment question file.')
      return
    }

    const nextAssessments = assessments.map((item) =>
      item.id === assessmentId
        ? {
            ...item,
            questionFileName: file.name,
            questionFileUploadedAt: new Date().toISOString(),
          }
        : item,
    )
    const logs = [
      createLogEntry({
        action: 'assessment_question_upload',
        batchId: batch.batchId,
        message: `${file.name} uploaded as assessment question file for ${batch.trainingName}.`,
        recipient: batch.coordinatorSpoc ?? 'Coordinator',
        status: 'Completed',
        type: 'Assessment',
      }),
    ]

    if (assessmentDataMode === 'api') {
      try {
        const updatedAssessment = nextAssessments.find((item) => item.id === assessmentId)
        const persistedAssessment = await updateAssessmentRecord(
          batch.batchId,
          assessmentId,
          updatedAssessment,
        )
        const syncedAssessments = nextAssessments.map((item) =>
          item.id === assessmentId ? persistedAssessment : item,
        )
        setApiAssessments(syncedAssessments)
        setApiAssessmentBatchId(batch.batchId)
        saveLocalAssessments(syncedAssessments, logs)
        setMessage('Assessment question file metadata saved.')
        event.target.value = ''
        return
      } catch (error) {
        console.warn('Backend assessment question metadata persistence failed; keeping in-memory state.', error)
        setAssessmentDataMode('local')
      }
    }

    saveLocalAssessments(nextAssessments, logs)
    setMessage('Assessment question file uploaded locally.')
    event.target.value = ''
  }

  const handleEvidenceFile = async (event, assessmentId) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select an assessment evidence file.')
      return
    }

    // TODO: Persist assessment file bytes in Azure Blob Storage when upload APIs exist.
    const evidenceMetadata = {
      id: `EV-${Date.now().toString().slice(-6)}`,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }

    if (assessmentDataMode === 'api') {
      try {
        const persistedEvidence = await createAssessmentEvidence(
          batch.batchId,
          assessmentId,
          evidenceMetadata,
        )
        evidenceMetadata.id = persistedEvidence.id
        evidenceMetadata.uploadedAt = persistedEvidence.uploadedAt
      } catch (error) {
        console.warn('Backend assessment evidence metadata persistence failed; keeping in-memory state.', error)
        setAssessmentDataMode('local')
      }
    }

    const nextAssessments = assessments.map((item) =>
      item.id === assessmentId
        ? {
            ...item,
            evidenceFiles: [
              ...(item.evidenceFiles ?? []),
              evidenceMetadata,
            ],
          }
        : item,
    )
    const logs = [
      createLogEntry({
        action: 'assessment_evidence_upload',
        batchId: batch.batchId,
        message: `${file.name} uploaded as assessment evidence for ${batch.trainingName}.`,
        recipient: batch.coordinatorSpoc ?? 'Coordinator',
        status: 'Completed',
        type: 'Assessment',
      }),
    ]

    if (assessmentDataMode === 'api') {
      setApiAssessments(nextAssessments)
      setApiAssessmentBatchId(batch.batchId)
    }

    saveLocalAssessments(nextAssessments, logs)
    setMessage('Assessment evidence uploaded locally.')
    event.target.value = ''
  }

  const removeEvidenceFile = (assessmentId, evidenceId) => {
    if (assessmentDataMode === 'api') {
      deleteAssessmentEvidence(batch.batchId, assessmentId, evidenceId).catch((error) => {
        console.warn('Backend assessment evidence metadata delete failed; keeping in-memory state.', error)
        setAssessmentDataMode('local')
      })
    }

    const nextAssessments = assessments.map((item) =>
      item.id === assessmentId
        ? {
            ...item,
            evidenceFiles: (item.evidenceFiles ?? []).filter((file) => file.id !== evidenceId),
          }
        : item,
    )

    if (assessmentDataMode === 'api') {
      setApiAssessments(nextAssessments)
      setApiAssessmentBatchId(batch.batchId)
    }

    saveLocalAssessments(nextAssessments)
    setMessage('Assessment evidence removed locally.')
  }

  const handleUpload = async (event, assessmentId) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select an assessment Excel file.')
      return
    }

    try {
      const assessment = assessments.find((item) => item.id === assessmentId)
      const results = await parseAssessmentUpload(file, effectiveBatch, assessment)
      const nextAssessments = assessments.map((item) =>
        item.id === assessmentId
          ? {
              ...item,
              results: [...(item.results ?? []), ...results],
              uploadedFileName: file.name,
              uploadedAt: new Date().toISOString(),
            }
          : item,
      )
      const logs = [
        createLogEntry({
          action: 'assessment_upload',
          batchId: batch.batchId,
          category: 'alert',
          message: `${file.name} uploaded for assessment ${assessment.name}.`,
          recipient: batch.coordinatorSpoc ?? 'Coordinator',
          status: 'Completed',
          type: 'Assessment',
        }),
        createAssessmentUploadNotification(batch, assessment, {
          uploadedBy: 'Trainer/Coordinator',
          recordCount: results.length,
        }),
      ]

      if (assessmentDataMode === 'api') {
        try {
          const persistedAssessment = await uploadAssessmentResults(
            batch.batchId,
            assessmentId,
            {
              uploadedFileName: file.name,
              results,
            },
          )

          setApiAssessments((current) =>
            (current ?? []).map((item) =>
              item.id === assessmentId ? persistedAssessment : item,
            ),
          )
          onUpdateBatch(batch.batchId, {
            ...batch,
            assessments: nextAssessments.map((item) =>
              item.id === assessmentId ? persistedAssessment : item,
            ),
          })
          setApiAssessmentBatchId(batch.batchId)
          await refreshApiAssessmentSignals()
          onLogEvent?.(logs)
          setMessage(`${results.length} assessment score(s) uploaded.`)
          return
        } catch (error) {
          console.warn('Backend assessment upload failed; using batch-state fallback.', error)
          setAssessmentDataMode('local')
        }
      }

      saveLocalAssessments(nextAssessments, logs)
      setMessage(`${results.length} assessment score(s) uploaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload assessment scores.')
    } finally {
      event.target.value = ''
    }
  }

  const sendAssessmentReminder = async (assessment) => {
    if (reminderSendingId) return
    setReminderSendingId(assessment.id)
    try {
      const delivery = await sendAssessmentReminderEmail(batch.batchId, assessment)
      setReminderDelivery(delivery)
      onLogEvent?.(createLogEntry({
        action: 'assessment_reminder_delivery',
        batchId: batch.batchId,
        message: `${assessment.name} reminder delivery completed: ${delivery.sent ?? 0} sent, ${delivery.failed ?? 0} failed, ${delivery.skipped ?? 0} skipped.`,
        status: delivery.failed ? 'Failed' : delivery.sent ? 'Sent' : 'Skipped',
        type: 'Assessment',
      }))
      setMessage(`${assessment.name} reminder delivery completed: ${delivery.sent ?? 0} sent, ${delivery.failed ?? 0} failed, ${delivery.skipped ?? 0} skipped.`)
    } catch (error) {
      setReminderDelivery(null)
      setMessage(error.message || `Unable to send assessment reminder for ${assessment.name}.`)
    } finally {
      setReminderSendingId('')
    }
  }

  const handleDownloadScoreTemplate = async (assessment) => {
    try {
      await downloadAssessmentTemplate(effectiveBatch, assessment)
      setMessage(`Score template downloaded with ${effectiveBatch.participants?.length ?? 0} participant row(s).`)
    } catch (error) {
      setMessage(error.message || 'Unable to download the score template.')
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Assessment</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Assessment List and Scores</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Configure assessments, then download score templates and upload completed score sheets.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Cleared" value={stats.cleared} />
          <SummaryCard label="Not Cleared" value={stats.notCleared} />
          <SummaryCard label="Remaining" value={stats.remaining} />
          <SummaryCard label="Clearance" value={`${stats.clearanceRate}%`} />
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}
      {canSendReminders ? (
        <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-slate-600">
          <strong>Assessment reminder recipients:</strong>{' '}
          {reminderRecipientEmails.join(', ') || 'No participant email available'}
        </p>
      ) : null}
      {canSendReminders && reminderDelivery ? (
        <ReminderDeliverySummary delivery={reminderDelivery} />
      ) : null}

      {canConfigure ? (
        <form onSubmit={handleSubmit} className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <TextField label="Assessment name" value={form.name} onChange={(value) => updateField('name', value)} />
            <SelectField label="Type" options={assessmentTypes} value={form.type} onChange={(value) => updateField('type', value)} />
            <TextField label="Date" type="date" value={form.date} onChange={(value) => updateField('date', value)} />
            <TextField label="Cutoff score" type="number" value={form.cutoffScore} onChange={(value) => updateField('cutoffScore', value)} />
            <TextField label="Max score" type="number" value={form.maxScore} onChange={(value) => updateField('maxScore', value)} />
            <TextField label="Weightage" type="number" value={form.weightage} onChange={(value) => updateField('weightage', value)} />
          </div>
          {form.type === 'Project Evaluation' ? (
            <div className="mt-3">
              <TextField
                label="Project remarks"
                required={false}
                value={form.remarks}
                onChange={(value) => updateField('remarks', value)}
              />
            </div>
          ) : null}
          <button
            type="submit"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Plus className="h-4 w-4" />
            Add assessment
          </button>
        </form>
      ) : null}

      <div className="mt-5 grid gap-4">
        {assessments.length ? (
          assessments.map((assessment) => (
            <article key={assessment.id} className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{assessment.type}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{assessment.name}</h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    Date: {assessment.date || 'Not set'} | Cutoff: {assessment.cutoffScore}% | Max: {assessment.maxScore} | Weightage: {assessment.weightage}%
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Uploaded scores: {assessment.results?.length ?? 0}
                  </p>
                  {canManageDocuments ? (
                    <>
                      <p className="mt-1 text-sm text-zinc-500">
                        Question file: {assessment.questionFileName ?? 'Not uploaded'}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Evidence files: {assessment.evidenceFiles?.length ?? 0}
                      </p>
                    </>
                  ) : null}
                  {assessment.type === 'Project Evaluation' && assessment.remarks ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      Remarks: {assessment.remarks}
                    </p>
                  ) : null}
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
                  {canManageDocuments ? (
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-cyan-300">
                      <Upload className="h-4 w-4" />
                      Question file
                      <input
                        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
                        type="file"
                        onChange={(event) => handleQuestionFile(event, assessment.id)}
                        className="sr-only"
                      />
                    </label>
                  ) : null}
                  {canUploadEvidence ? (
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-cyan-300">
                      <Upload className="h-4 w-4" />
                      Evidence
                      <input
                        accept=".pdf,.doc,.docx,.xlsx,.csv,.zip"
                        type="file"
                        onChange={(event) => handleEvidenceFile(event, assessment.id)}
                        className="sr-only"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDownloadScoreTemplate(assessment)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <Download className="h-4 w-4" />
                    Download Score Template
                  </button>
                  {canSendReminders ? (
                    <button
                      type="button"
                      onClick={() => sendAssessmentReminder(assessment)}
                      disabled={Boolean(reminderSendingId)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-wait disabled:opacity-60"
                    >
                      {reminderSendingId === assessment.id ? 'Sending...' : 'Reminder'}
                    </button>
                  ) : null}
                  {canEdit ? (
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300">
                      <Upload className="h-4 w-4" />
                      Upload Scores
                      <input
                        accept=".xlsx,.xls,.csv,text/csv"
                        type="file"
                        onChange={(event) => handleUpload(event, assessment.id)}
                        className="sr-only"
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {canManageDocuments && assessment.evidenceFiles?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {assessment.evidenceFiles.map((file) => (
                    <span
                      key={file.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300"
                    >
                      <span className="max-w-64 truncate">{file.name}</span>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeEvidenceFile(assessment.id, file.id)}
                          className="text-zinc-500 outline-none transition hover:text-white focus-visible:text-white"
                          aria-label={`Remove ${file.name}`}
                          title={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}

              {assessment.results?.length ? (
                <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[#11141b] text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Emp_Id</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Score %</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {assessment.results.map((result, resultIndex) => (
                        <tr key={`${result.participantId}-${result.uploadedAt ?? resultIndex}`} className="text-zinc-300">
                          <td className="px-4 py-3 font-medium text-white">{result.empId || '-'}</td>
                          <td className="px-4 py-3">{result.name}</td>
                          <td className="px-4 py-3">{result.email || '-'}</td>
                          <td className="px-4 py-3">{result.scorePercent}%</td>
                          <td className="px-4 py-3">{result.cleared ? 'Cleared' : 'Not Cleared'}</td>
                          <td className="px-4 py-3 text-zinc-400">{result.comments || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
            <FileSpreadsheet className="h-5 w-5 text-cyan-300" />
            No assessments configured yet.
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">Topper</p>
            <p className="mt-1 text-sm text-zinc-400">
              {toppers[0] ? `${toppers[0].name} (${toppers[0].finalScore}%)` : 'No topper calculated yet.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function ReminderDeliverySummary({ delivery }) {
  const recipients = delivery.recipients ?? []
  const fallbackUsed = recipients.some((recipient) => recipient.generatedBy === 'fallback')

  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3 text-xs text-slate-700 shadow-sm">
      <p className="font-semibold text-slate-900">
        Delivery result: {delivery.sent ?? 0} sent, {delivery.failed ?? 0} failed, {delivery.skipped ?? 0} skipped
      </p>
      {fallbackUsed ? (
        <p className="mt-2 rounded bg-blue-50 px-2 py-1 text-blue-700">
          AI fallback used for one or more messages. This is informational; email delivery status is shown below.
        </p>
      ) : null}
      <div className="mt-2 space-y-1">
        {recipients.map((recipient) => (
          <p key={`${recipient.email}-${recipient.name}-${recipient.status}`}>
            <strong>{recipient.status}:</strong> {recipient.name}{recipient.email ? ` (${recipient.email})` : ''}
            {recipient.reason ? ` - ${recipient.reason}` : ''}
          </p>
        ))}
      </div>
    </div>
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
        min={type === 'number' ? 0 : undefined}
        max={type === 'number' ? 100 : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
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
