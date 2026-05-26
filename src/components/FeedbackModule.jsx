import { Download, MessageSquareText, Send, Upload, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getFeedback,
  getFeedbackSummary,
  closeFeedbackRecord,
  triggerFeedbackRecord,
  uploadFeedbackDocument,
} from '../services/feedbackService'
import {
  generateFeedbackSummary,
  downloadFeedbackTriggerTemplate,
  getFeedbackAnalysis,
  normalizeFeedbackRating,
  parseFeedbackUpload,
  parseFeedbackTriggerUpload,
} from '../utils/feedbackEngine'
import { createLogEntry, resolveParticipantRecipientEmail } from '../utils/notificationEngine'

const emptyFeedback = {
  triggeredAt: '',
  responses: [],
  summary: 'Feedback has not been uploaded yet.',
}

function toDateTimeLocalValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatMetric(value) {
  return value === null || value === undefined || value === 'N/A'
    ? 'N/A'
    : `${Number(value).toFixed(2)}/5`
}

export function FeedbackModule({ batch, canEdit, onLogEvent, onUpdateBatch }) {
  const [message, setMessage] = useState('')
  const [windowForm, setWindowForm] = useState(() => ({
    startAt: toDateTimeLocalValue(batch.feedback?.startAt),
    endAt: toDateTimeLocalValue(batch.feedback?.endAt),
    feedbackLink: batch.feedback?.feedbackLink ?? '',
  }))
  const [eligibleParticipantIds, setEligibleParticipantIds] = useState([])
  const [apiFeedback, setApiFeedback] = useState(null)
  const [apiFeedbackBatchId, setApiFeedbackBatchId] = useState('')
  const [localFeedbackState, setLocalFeedbackState] = useState(null)
  const [feedbackDataMode, setFeedbackDataMode] = useState('local')
  const hasApiFeedback =
    feedbackDataMode === 'api' &&
    apiFeedbackBatchId === batch.batchId &&
    apiFeedback
  const hasLocalFeedbackState = localFeedbackState?.batchId === batch.batchId
  const feedback = hasApiFeedback
    ? apiFeedback
    : hasLocalFeedbackState
      ? localFeedbackState.feedback
      : batch.feedback ?? emptyFeedback
  const effectiveBatch = useMemo(
    () => ({
      ...batch,
      feedback,
    }),
    [batch, feedback],
  )
  const summary = useMemo(
    () => feedback.summary || generateFeedbackSummary(feedback.responses),
    [feedback.responses, feedback.summary],
  )
  const averageRating = useMemo(() => {
    const ratings = (feedback.responses ?? [])
      .map((response) => normalizeFeedbackRating(response.rating))
      .filter((rating) => rating !== null)

    if (!ratings.length) return 'N/A'
    return `${(ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(2)}/5`
  }, [feedback.responses])
  const feedbackAnalysis = feedback.aiAnalysis ?? getFeedbackAnalysis(feedback)
  const canTriggerFeedback = canEdit
  const eligibleRecipients = (batch.participants ?? [])
    .filter((participant) => eligibleParticipantIds.includes(participant.id))
    .map((participant) => resolveParticipantRecipientEmail(participant))
    .filter(Boolean)
  const downloadEligibleParticipantTemplate = async () => {
    try {
      await downloadFeedbackTriggerTemplate(batch)
      setMessage(`Eligible participant template downloaded with ${batch.participants?.length ?? 0} participant row(s). Keep only participants who should receive the feedback link.`)
    } catch (error) {
      setMessage(error.message || 'Unable to download the eligible participant template.')
    }
  }

  useEffect(() => {
    let isMounted = true

    getFeedback(batch.batchId)
      .then(async (backendFeedback) => {
        if (!isMounted) return

        const summaryPayload = await getFeedbackSummary(batch.batchId)

        if (!isMounted) return

        setApiFeedback({
          ...backendFeedback,
          summary: summaryPayload.summary ?? backendFeedback.summary,
          aiAnalysis: summaryPayload.aiAnalysis ?? backendFeedback.aiAnalysis,
        })
        setApiFeedbackBatchId(batch.batchId)
        setFeedbackDataMode('api')
        setWindowForm({
          feedbackLink: backendFeedback.feedbackLink ?? '',
          startAt: toDateTimeLocalValue(backendFeedback.startAt),
          endAt: toDateTimeLocalValue(backendFeedback.endAt),
        })
      })
      .catch((error) => {
        console.warn('Backend feedback unavailable; using batch-state fallback.', error)
        if (isMounted) setFeedbackDataMode('local')
      })

    return () => {
      isMounted = false
    }
  }, [batch.batchId])

  const saveFeedback = (nextFeedback, logs = []) => {
    setLocalFeedbackState({
      batchId: batch.batchId,
      feedback: nextFeedback,
    })
    onUpdateBatch(batch.batchId, {
      ...batch,
      feedback: nextFeedback,
    })
    if (logs.length) onLogEvent?.(logs)
  }

  const triggerFeedback = async () => {
    if (windowForm.startAt && windowForm.endAt && new Date(windowForm.endAt) <= new Date(windowForm.startAt)) {
      setMessage('Feedback end date/time must be after the start date/time.')
      return
    }

    try {
      const link = new URL(windowForm.feedbackLink)
      if (!['http:', 'https:'].includes(link.protocol)) throw new Error()
    } catch {
      setMessage('Enter a valid feedback link URL before sending feedback requests.')
      return
    }
    if (!eligibleParticipantIds.length) {
      setMessage('Upload the eligible participant trigger template before sending feedback requests.')
      return
    }

    const nextFeedback = {
      ...feedback,
      ...windowForm,
      triggeredAt: new Date().toISOString(),
    }
    const logs = [
      createLogEntry({
        action: 'feedback_triggered',
        batchId: batch.batchId,
        message: `Feedback trigger delivery requested for ${batch.trainingName}.`,
        status: 'Completed',
        type: 'Feedback',
      }),
    ]

    if (feedbackDataMode === 'api') {
      try {
        const persistedFeedback = await triggerFeedbackRecord(batch.batchId, {
          ...windowForm,
          eligibleParticipantIds,
        })
        const summaryPayload = await getFeedbackSummary(batch.batchId)

        setApiFeedback({
          ...persistedFeedback,
          summary: summaryPayload.summary ?? persistedFeedback.summary,
          aiAnalysis: summaryPayload.aiAnalysis ?? persistedFeedback.aiAnalysis,
        })
        setApiFeedbackBatchId(batch.batchId)
        onUpdateBatch(batch.batchId, {
          ...batch,
          feedback: {
            ...persistedFeedback,
            ...windowForm,
            summary: summaryPayload.summary ?? persistedFeedback.summary,
            aiAnalysis: summaryPayload.aiAnalysis ?? persistedFeedback.aiAnalysis,
          },
        })
        onLogEvent?.(logs)
        const delivery = persistedFeedback.deliverySummary ?? {}
        setMessage(`Feedback delivery complete. Sent: ${delivery.sent ?? 0}, Failed: ${delivery.failed ?? 0}, Skipped: ${delivery.skipped ?? 0}.`)
        return
      } catch (error) {
        setMessage(error.message || 'Unable to send feedback requests.')
        return
      }
    }

    saveFeedback(nextFeedback, logs)
    setMessage('Feedback trigger is unavailable until the backend is connected.')
  }

  const handleTriggerParticipantUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rows = await parseFeedbackTriggerUpload(file, batch)
      setEligibleParticipantIds([...new Set(rows.map((row) => row.participantId))])
      setMessage(`${rows.length} eligible feedback participant(s) selected.`)
    } catch (error) {
      setMessage(error.message || 'Unable to read feedback participant trigger template.')
    } finally {
      event.target.value = ''
    }
  }

  const closeFeedback = async () => {
    try {
      const persistedFeedback = await closeFeedbackRecord(batch.batchId)
      setApiFeedback(persistedFeedback)
      setApiFeedbackBatchId(batch.batchId)
      onUpdateBatch(batch.batchId, { ...batch, feedback: persistedFeedback })
      setMessage('Feedback window closed. New submissions are no longer accepted.')
    } catch (error) {
      setMessage(error.message || 'Unable to close the feedback window.')
    }
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select a feedback response file.')
      return
    }

    try {
      if (feedbackDataMode === 'api') {
        const persistedFeedback = await uploadFeedbackDocument(batch.batchId, file)
        const summaryPayload = await getFeedbackSummary(batch.batchId)
        setApiFeedback({
          ...persistedFeedback,
          summary: summaryPayload.summary ?? persistedFeedback.summary,
          aiAnalysis: summaryPayload.aiAnalysis ?? persistedFeedback.aiAnalysis,
        })
        setApiFeedbackBatchId(batch.batchId)
        onUpdateBatch(batch.batchId, {
          ...batch,
          feedback: {
            ...persistedFeedback,
            summary: summaryPayload.summary ?? persistedFeedback.summary,
            aiAnalysis: summaryPayload.aiAnalysis ?? persistedFeedback.aiAnalysis,
          },
        })
        onLogEvent?.([createLogEntry({
          action: 'feedback_upload',
          batchId: batch.batchId,
          message: `${file.name} uploaded as feedback report for ${batch.trainingName}.`,
        })])
        setMessage(`${persistedFeedback.responses?.length ?? 0} structured feedback response(s) processed from ${file.name}.`)
        return
      }
      const responses = await parseFeedbackUpload(file, effectiveBatch)
      const nextFeedback = {
        ...feedback,
        uploadedAt: new Date().toISOString(),
        uploadedFileName: file.name,
        responses,
        summary: generateFeedbackSummary(responses),
      }
      const logs = [
        createLogEntry({
          action: 'feedback_upload',
          batchId: batch.batchId,
          message: `${file.name} uploaded as feedback report for ${batch.trainingName}.`,
        }),
      ]

      saveFeedback(nextFeedback, logs)
      setMessage(`${responses.length} feedback response(s) uploaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload feedback report.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Feedback</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Feedback Collection</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Select eligible participants, send formal feedback requests, close collection, and review the response summary.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">
          {canEdit ? (
            <button
              type="button"
              onClick={downloadEligibleParticipantTemplate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <Download className="h-4 w-4" />
              Download Eligible Template
            </button>
          ) : null}
          {canEdit ? (
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-cyan-300">
              <Upload className="h-4 w-4" />
              Upload Eligible Participants
              <input accept=".xlsx" type="file" onChange={handleTriggerParticipantUpload} className="sr-only" />
            </label>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={triggerFeedback}
              disabled={!canTriggerFeedback}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
            >
              <Send className="h-4 w-4" />
              {feedback.triggeredAt ? 'Send Reminder' : 'Trigger Feedback'}
            </button>
          ) : null}
          {canEdit ? (
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-cyan-300">
              <Upload className="h-4 w-4" />
              Upload Responses
              <input
                accept=".xlsx,.csv,.pdf,.docx,.txt"
                type="file"
                onChange={handleUpload}
                className="sr-only"
              />
            </label>
          ) : null}
          {canEdit && feedback.triggeredAt && !feedback.closedAt ? (
            <button
              type="button"
              onClick={closeFeedback}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] px-4 text-sm font-medium text-rose-100 outline-none transition hover:bg-rose-300/[0.12] focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <XCircle className="h-4 w-4" />
              Close Feedback
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}
      {canEdit ? (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-slate-600">
          <p className="mb-2">
            <strong>Eligible participant template:</strong> This sheet contains participant identity details only. The link supplied below is emailed only to uploaded eligible participants.
          </p>
          <strong>Feedback recipients before send:</strong>{' '}
          {eligibleRecipients.join(', ') || 'Upload eligible participants to preview recipient email IDs.'}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <FeedbackStatusCard
          label="Feedback status"
          value={feedback.closedAt ? 'Closed' : feedback.triggeredAt ? 'Triggered' : 'Not triggered'}
        />
        <FeedbackStatusCard label="Average rating" value={averageRating} />
        <FeedbackStatusCard
          label="Summary available"
          value={summary && summary !== emptyFeedback.summary ? 'Yes' : 'No'}
        />
        <FeedbackStatusCard
          label="Content quality"
          value={formatMetric(feedbackAnalysis.averageContentQuality)}
        />
        <FeedbackStatusCard
          label="Trainer effectiveness"
          value={formatMetric(feedbackAnalysis.averageTrainerEffectiveness)}
        />
      </div>

      {canEdit ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-3">
          <TextField
            label="Feedback link URL"
            value={windowForm.feedbackLink}
            onChange={(value) => setWindowForm((current) => ({ ...current, feedbackLink: value }))}
          />
          <DateTimeField
            label="Feedback start"
            value={windowForm.startAt}
            onChange={(value) => setWindowForm((current) => ({ ...current, startAt: value }))}
          />
          <DateTimeField
            label="Feedback end"
            value={windowForm.endAt}
            onChange={(value) => setWindowForm((current) => ({ ...current, endAt: value }))}
          />
        </div>
      ) : null}

      {feedback.feedbackLink ? (
        <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">
            Configured feedback link
          </p>
          <a
            href={feedback.feedbackLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all text-sm text-cyan-100 underline underline-offset-4"
          >
            {feedback.feedbackLink}
          </a>
          <p className="mt-2 text-xs text-zinc-400">
            Eligible participants receive this coordinator-provided form link by email.
          </p>
        </div>
      ) : null}

      {feedback.deliverySummary?.recipients?.length ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">Reminder Delivery Summary</p>
          <p className="mt-2 text-xs text-zinc-400">Sent: {feedback.deliverySummary.sent} | Failed: {feedback.deliverySummary.failed} | Skipped: {feedback.deliverySummary.skipped}</p>
          <div className="mt-3 space-y-2 text-xs text-zinc-300">
            {feedback.deliverySummary.recipients.map((recipient) => (
              <p key={`${recipient.participantId}-${recipient.reminderCount}`}>
                {recipient.name} | {recipient.email || 'No email'} | Reminder {recipient.reminderCount} | {recipient.status}{recipient.reason ? ` - ${recipient.reason}` : ''}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-1 h-5 w-5 text-cyan-300" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Feedback Summary</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{summary}</p>
            {feedbackAnalysis.sentimentSummary ? <p className="mt-2 text-sm leading-6 text-cyan-100"><strong>AI Feedback Analysis:</strong> {feedbackAnalysis.sentimentSummary}</p> : null}
            {feedbackAnalysis.topCommonTakeaways?.length ? <p className="mt-2 text-xs text-zinc-400"><strong>Takeaways:</strong> {feedbackAnalysis.topCommonTakeaways.join('; ')}</p> : null}
            {feedbackAnalysis.topImprovementAreas?.length ? <p className="mt-2 text-xs text-zinc-400"><strong>Improvement areas:</strong> {feedbackAnalysis.topImprovementAreas.join('; ')}</p> : null}
            {feedbackAnalysis.recommendedActions?.length ? <p className="mt-2 text-xs text-zinc-400">Recommended actions: {feedbackAnalysis.recommendedActions.join(' ')}</p> : null}
            <p className="mt-2 text-xs text-zinc-500">
              Triggered: {feedback.triggeredAt ? new Date(feedback.triggeredAt).toLocaleString() : 'Not triggered'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Window: {feedback.startAt ? new Date(feedback.startAt).toLocaleString() : 'Not set'} to {feedback.endAt ? new Date(feedback.endAt).toLocaleString() : 'Not set'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function DateTimeField({ label, onChange, value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      />
    </label>
  )
}

function TextField({ label, onChange, value }) {
  return (
    <label className="block md:col-span-3">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input type="url" value={value} placeholder="https://forms.example.com/feedback" onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" />
    </label>
  )
}

function FeedbackStatusCard({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
