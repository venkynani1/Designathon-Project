import { MessageSquareText, Send, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { generateFeedbackSummary, parseFeedbackUpload } from '../utils/feedbackEngine'
import { createFeedbackTrigger, createLogEntry } from '../utils/notificationEngine'

export function FeedbackModule({ batch, canEdit, onLogEvent, onUpdateBatch }) {
  const [message, setMessage] = useState('')
  const feedback = batch.feedback ?? {
    triggeredAt: '',
    responses: [],
    summary: 'Feedback has not been uploaded yet.',
  }
  const summary = useMemo(
    () => feedback.summary || generateFeedbackSummary(feedback.responses),
    [feedback.responses, feedback.summary],
  )

  const saveFeedback = (nextFeedback, logs = []) => {
    onUpdateBatch(batch.batchId, {
      ...batch,
      feedback: nextFeedback,
    })
    if (logs.length) onLogEvent?.(logs)
  }

  const triggerFeedback = () => {
    const nextFeedback = {
      ...feedback,
      triggeredAt: new Date().toISOString(),
    }

    saveFeedback(nextFeedback, [
      createFeedbackTrigger(batch),
      createLogEntry({
        action: 'feedback_triggered',
        batchId: batch.batchId,
        message: `Feedback trigger sent for ${batch.trainingName}.`,
      }),
    ])
    setMessage('Feedback trigger logged.')
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMessage('Please select a feedback CSV report.')
      return
    }

    try {
      const responses = await parseFeedbackUpload(file, batch)
      const nextFeedback = {
        ...feedback,
        uploadedAt: new Date().toISOString(),
        uploadedFileName: file.name,
        responses,
        summary: generateFeedbackSummary(responses),
      }

      saveFeedback(nextFeedback, [
        createLogEntry({
          action: 'feedback_upload',
          batchId: batch.batchId,
          message: `${file.name} uploaded as feedback report for ${batch.trainingName}.`,
        }),
      ])
      setMessage(`${responses.length} feedback response(s) uploaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload feedback report.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
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

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-1 h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">AI Feedback Summary</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{summary}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Triggered: {feedback.triggeredAt ? new Date(feedback.triggeredAt).toLocaleString() : 'Not triggered'}
            </p>
          </div>
        </div>
      </div>

      {feedback.responses?.length ? (
        <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Emp_Id</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Matched</th>
                <th className="px-4 py-3 font-medium">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {feedback.responses.map((response) => (
                <tr key={response.id} className="text-zinc-300">
                  <td className="px-4 py-3 font-medium text-white">{response.empId || '-'}</td>
                  <td className="px-4 py-3">{response.name || '-'}</td>
                  <td className="px-4 py-3">{response.email || '-'}</td>
                  <td className="px-4 py-3">{response.rating ?? '-'}</td>
                  <td className="px-4 py-3">{response.matched ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-zinc-400">{response.comments || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
