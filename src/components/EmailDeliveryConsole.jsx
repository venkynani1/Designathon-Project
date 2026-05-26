import { MailCheck, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  listEmailLogs,
  testFeedbackEmail,
  testPlacementEscalation,
  testTrainerReminder,
} from '../services/notificationService'

function StatusBadge({ status }) {
  const color = status === 'Failed'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : status === 'Skipped'
      ? 'border-slate-200 bg-slate-50 text-slate-600'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return <span className={`rounded-full border px-2 py-1 text-xs font-medium ${color}`}>{status}</span>
}

function emailsForBatch(batch) {
  return [...new Set([
    ...(batch?.assignedTrainers ?? []).map((trainer) => trainer.email),
    batch?.trainer?.email,
  ].filter(Boolean))]
}

export function EmailDeliveryConsole({ batches }) {
  const [logs, setLogs] = useState([])
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.batchId ?? '')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState('')
  const batch = useMemo(
    () => batches.find((entry) => entry.batchId === selectedBatchId) ?? batches[0],
    [batches, selectedBatchId],
  )
  const participantEmail = batch?.participants?.find((participant) => participant.officialEmail || participant.email)
  const placementEmail = batch?.participants?.find((participant) => participant.placementOfficerEmail)

  const refresh = async () => {
    setLoading(true)
    try {
      setLogs(await listEmailLogs())
    } catch (error) {
      setMessage(error.message || 'Unable to load email delivery logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    listEmailLogs()
      .then((entries) => {
        if (active) setLogs(entries)
      })
      .catch((error) => {
        if (active) setMessage(error.message || 'Unable to load email delivery logs.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const runTest = async (label, send) => {
    if (!batch) return
    setSending(label)
    setMessage('')
    try {
      const result = await send()
      setMessage(`${label}: ${result.status} to ${result.recipients.join(', ')} (${result.generatedBy}).`)
      await refresh()
    } catch (error) {
      setMessage(error.message || `Unable to send ${label}.`)
    } finally {
      setSending('')
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="border-b border-blue-100 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-600">Delivery Verification</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Email Logs</h1>
        <p className="mt-2 text-sm text-slate-500">
          Verify saved recipients, Azure delivery status, and AI generation origin without exposing credentials.
        </p>
      </header>

      <div className="mt-5 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,auto)]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Verification batch</span>
            <select
              value={batch?.batchId ?? ''}
              onChange={(event) => setSelectedBatchId(event.target.value)}
              className="h-11 w-full rounded-lg border border-blue-100 bg-slate-50 px-3 text-sm text-slate-900"
            >
              {batches.map((entry) => <option key={entry.batchId} value={entry.batchId}>{entry.batchId} - {entry.trainingName}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={!emailsForBatch(batch).length || Boolean(sending)}
            onClick={() => runTest('Trainer reminder test', () => testTrainerReminder(batch.batchId))}
            className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-45"
          >
            <Send className="h-4 w-4" /> Test Trainer
          </button>
          <button
            type="button"
            disabled={!participantEmail || Boolean(sending)}
            onClick={() => runTest('Feedback email test', () => testFeedbackEmail(batch.batchId, [participantEmail.id]))}
            className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 disabled:opacity-45"
          >
            <Send className="h-4 w-4" /> Test Feedback
          </button>
          <button
            type="button"
            disabled={!placementEmail || batch?.batchType !== 'External/Segue' || Boolean(sending)}
            onClick={() => runTest('Placement escalation test', () => testPlacementEscalation(batch.batchId))}
            className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 disabled:opacity-45"
          >
            <Send className="h-4 w-4" /> Test Placement
          </button>
        </div>
        {batch ? (
          <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
            <p><strong>Trainer:</strong> {emailsForBatch(batch).join(', ') || 'Not assigned'}</p>
            <p><strong>Feedback sample:</strong> {(participantEmail?.officialEmail || participantEmail?.email) ?? 'Unavailable'}</p>
            <p><strong>Placement officer:</strong> {placementEmail?.placementOfficerEmail ?? 'Not applicable'}</p>
          </div>
        ) : null}
        {message ? <p className="mt-3 text-sm text-blue-700">{message}</p> : null}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MailCheck className="h-4 w-4 text-blue-600" /> Delivery history</h2>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 text-sm text-blue-700">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-blue-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Event</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Provider / AI</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50 text-slate-700">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{log.event}</td>
                  <td className="max-w-52 break-words px-4 py-3">{(log.to ?? []).join(', ')}</td>
                  <td className="max-w-56 truncate px-4 py-3" title={log.subject}>{log.subject}</td>
                  <td className="px-4 py-3">{log.provider} / {log.generatedBy}</td>
                  <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3">{log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}</td>
                  <td className="max-w-44 truncate px-4 py-3 text-rose-600" title={log.error}>{log.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !logs.length ? <p className="p-8 text-center text-sm text-slate-500">No delivery attempts recorded yet.</p> : null}
        </div>
      </div>
    </section>
  )
}
