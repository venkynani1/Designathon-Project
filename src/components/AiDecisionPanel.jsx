import { RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getAiAnomalies,
  getAiBatchSummary,
  getAiFeedbackAnalysis,
  getAiTopperJustification,
} from '../services/aiDecisionService'

function RiskBadge({ level }) {
  const className = level === 'HIGH'
    ? 'border-rose-300/30 bg-rose-300/10 text-rose-200'
    : level === 'MEDIUM'
      ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
      : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${className}`}>{level}</span>
}

function TextItems({ items }) {
  return (
    <ul className="mt-2 space-y-1 text-xs text-zinc-300">
      {(items ?? []).slice(0, 4).map((item) => <li key={item}>- {item}</li>)}
    </ul>
  )
}

function fetchDecisionData(batchId, refresh = false) {
  return Promise.all([
    getAiBatchSummary(batchId, refresh),
    getAiFeedbackAnalysis(batchId, refresh),
    getAiTopperJustification(batchId, refresh),
    getAiAnomalies(batchId, refresh),
  ]).then(([summary, feedback, topper, anomalies]) => ({ summary, feedback, topper, anomalies }))
}

export function AiDecisionPanel({ batch }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const regenerate = async () => {
    setLoading(true)
    setMessage('')
    try {
      setData(await fetchDecisionData(batch.batchId, true))
      setMessage('AI decision insights regenerated from current batch evidence.')
    } catch (error) {
      setMessage(error.message || 'Unable to load AI decision insights.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchDecisionData(batch.batchId)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error) => {
        if (active) setMessage(error.message || 'Unable to load AI decision insights.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [batch.batchId])

  return (
    <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            AI Batch Summary
          </h2>
          <p className="mt-1 text-xs text-zinc-400">Rules are always included; OpenAI refines narratives only when enabled.</p>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Regenerate
        </button>
      </div>

      {message ? <p className="mt-3 text-xs text-cyan-100">{message}</p> : null}
      {loading && !data ? <p className="mt-4 text-sm text-zinc-400">Loading decision insights...</p> : null}

      {data ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm text-zinc-200">{data.summary.summary}</p>
              <TextItems items={data.summary.recommendedActions} />
            </div>
            <div className="flex gap-2 text-center">
              <div className="rounded-lg border border-white/10 px-3 py-2">
                <p className="text-xl font-semibold text-white">{data.summary.healthScore}</p>
                <p className="text-[11px] text-zinc-400">Health</p>
              </div>
              <div className="rounded-lg border border-rose-300/20 px-3 py-2">
                <p className="text-xl font-semibold text-rose-100">{data.summary.highRiskCount}</p>
                <p className="text-[11px] text-zinc-400">High Risk</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white">Participant Risk Classification</h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/[0.035] text-zinc-400">
                  <tr><th className="px-3 py-2">Participant</th><th className="px-3 py-2">Risk</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Reason / Action</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.summary.participantRisks.map((participant) => (
                    <tr key={participant.participantId || participant.name}>
                      <td className="px-3 py-2 text-zinc-100">{participant.name}</td>
                      <td className="px-3 py-2"><RiskBadge level={participant.riskLevel} /></td>
                      <td className="px-3 py-2 text-zinc-200">{participant.riskScore}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        <p>{participant.reasons[0]}</p>
                        <p className="mt-1 text-zinc-500">{participant.recommendedAction}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-lg border border-white/10 bg-black/10 p-3">
              <h3 className="text-sm font-medium text-white">AI Feedback Analysis</h3>
              <p className="mt-2 text-xs text-zinc-300">{data.feedback.sentimentSummary}</p>
              <TextItems items={data.feedback.actionItems} />
            </article>
            <article className="rounded-lg border border-white/10 bg-black/10 p-3">
              <h3 className="text-sm font-medium text-white">AI Topper Justification</h3>
              <p className="mt-2 text-xs text-zinc-300">{data.topper.justification}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-black/10 p-3">
              <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                <TriangleAlert className="h-4 w-4 text-amber-200" />
                AI Anomaly Detection
              </h3>
              <p className="mt-2 text-xs text-zinc-300">{data.anomalies.aiNarrative}</p>
              <TextItems items={data.anomalies.anomalies.map((anomaly) => anomaly.message)} />
            </article>
          </div>

          <p className="text-[11px] text-zinc-500">
            Generated by: {data.summary.generatedBy === 'openai' ? 'OpenAI with rule evidence' : 'deterministic rules'}
            {data.summary.cached ? ' (cached)' : ''}
          </p>
        </div>
      ) : null}
    </section>
  )
}
