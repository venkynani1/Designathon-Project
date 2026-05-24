import { MessageSquareText, Send, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getFeedback,
  getFeedbackSummary,
  triggerFeedbackRecord,
  uploadFeedbackResponses,
} from '../services/feedbackService'
import { generateFeedbackSummary, parseFeedbackUpload } from '../utils/feedbackEngine'
import { createFeedbackTrigger, createLogEntry } from '../utils/notificationEngine'

const emptyFeedback = {
  triggeredAt: '',
  responses: [],
  summary: 'Feedback has not been uploaded yet.',
}

export function FeedbackModule({ batch, canEdit, onLogEvent, onUpdateBatch }) {
  const [message, setMessage] = useState('')
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
      .map((response) => Number(response.rating))
      .filter((rating) => Number.isFinite(rating))

    if (!ratings.length) return 'N/A'
    return (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1)
  }, [feedback.responses])
  const canTriggerFeedback =
    ['Completed', 'Closed'].includes(batch.status) ||
    (batch.endDate && new Date() >= new Date(`${batch.endDate}T00:00:00.000Z`))

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
        })
        setApiFeedbackBatchId(batch.batchId)
        setFeedbackDataMode('api')
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
    if (!canTriggerFeedback) {
      setMessage('Feedback can be triggered after the training end date or when the batch is completion-ready.')
      return
    }

    const nextFeedback = {
      ...feedback,
      triggeredAt: new Date().toISOString(),
    }
    const logs = [
      createFeedbackTrigger(batch),
      createLogEntry({
        action: 'feedback_triggered',
        batchId: batch.batchId,
        message: `Feedback trigger sent for ${batch.trainingName}.`,
      }),
    ]

    if (feedbackDataMode === 'api') {
      try {
        const persistedFeedback = await triggerFeedbackRecord(batch.batchId)
        const summaryPayload = await getFeedbackSummary(batch.batchId)

        setApiFeedback({
          ...persistedFeedback,
          summary: summaryPayload.summary ?? persistedFeedback.summary,
        })
        setApiFeedbackBatchId(batch.batchId)
        onLogEvent?.(logs)
        setMessage('Feedback trigger logged.')
        return
      } catch (error) {
        console.warn('Backend feedback trigger failed; using batch-state fallback.', error)
        setFeedbackDataMode('local')
      }
    }

    saveFeedback(nextFeedback, logs)
    setMessage('Feedback trigger logged.')
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select a feedback CSV report.')
      return
    }

    try {
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

      if (feedbackDataMode === 'api') {
        try {
          const persistedFeedback = await uploadFeedbackResponses(batch.batchId, {
            uploadedFileName: file.name,
            responses,
            summary: nextFeedback.summary,
          })
          const summaryPayload = await getFeedbackSummary(batch.batchId)

          setApiFeedback({
            ...persistedFeedback,
            summary: summaryPayload.summary ?? persistedFeedback.summary,
          })
          setApiFeedbackBatchId(batch.batchId)
          onLogEvent?.(logs)
          setMessage(`${responses.length} feedback response(s) uploaded.`)
          return
        } catch (error) {
          console.warn('Backend feedback upload failed; using batch-state fallback.', error)
          setFeedbackDataMode('local')
        }
      }

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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Feedback</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Feedback Collection</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Trigger feedback, upload feedback CSV reports, and review a generated feedback summary.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canEdit ? (
            <button
              type="button"
              onClick={triggerFeedback}
              disabled={!canTriggerFeedback}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
            >
              <Send className="h-4 w-4" />
              Trigger feedback
            </button>
          ) : null}
          {canEdit ? (
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-cyan-300">
              <Upload className="h-4 w-4" />
              Upload report
              <input
                accept=".csv,text/csv"
                type="file"
                onChange={handleUpload}
                className="sr-only"
              />
            </label>
          ) : null}
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FeedbackStatusCard
          label="Feedback status"
          value={feedback.triggeredAt ? 'Triggered' : 'Not triggered'}
        />
        <FeedbackStatusCard label="Average rating" value={averageRating} />
        <FeedbackStatusCard
          label="Summary available"
          value={summary && summary !== emptyFeedback.summary ? 'Yes' : 'No'}
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-1 h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">Feedback Summary</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{summary}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Triggered: {feedback.triggeredAt ? new Date(feedback.triggeredAt).toLocaleString() : 'Not triggered'}
            </p>
          </div>
        </div>
      </div>
    </section>
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
