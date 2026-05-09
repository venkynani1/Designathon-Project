import { Download, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  getAssessmentReportData,
  getConsolidatedReportData,
  getTopperReportData,
} from '../services/reportService'
import { calculateTopper, getAssessmentStats } from '../utils/assessmentEngine'
import {
  exportAssessmentReport,
  exportConsolidatedReport,
  exportTopperReport,
} from '../utils/attendanceExport'
import { createLogEntry } from '../utils/notificationEngine'

export function ReportsModule({ batch, onLogEvent }) {
  const [message, setMessage] = useState('')
  const assessmentStats = useMemo(() => getAssessmentStats(batch), [batch])
  const toppers = useMemo(() => calculateTopper(batch), [batch])

  const runExport = async (label, exporter) => {
    await exporter()
    onLogEvent?.([
      createLogEntry({
        action: `${label.toLowerCase().replaceAll(' ', '_')}_export`,
        batchId: batch.batchId,
        message: `${label} exported for ${batch.trainingName}.`,
      }),
    ])
    setMessage(`${label} exported.`)
  }

  const exportAssessment = async () => {
    try {
      const data = await getAssessmentReportData(batch.batchId)
      await exportAssessmentReport(data.batch)
    } catch (error) {
      console.warn('Backend assessment report data unavailable; using local fallback.', error)
      await exportAssessmentReport(batch)
    }
  }

  const exportTopper = async () => {
    try {
      const data = await getTopperReportData(batch.batchId)
      await exportTopperReport(data.batch, data.toppers)
    } catch (error) {
      console.warn('Backend topper report data unavailable; using local fallback.', error)
      await exportTopperReport(batch, toppers)
    }
  }

  const exportConsolidated = async () => {
    try {
      const data = await getConsolidatedReportData(batch.batchId)
      await exportConsolidatedReport(data)
    } catch (error) {
      console.warn('Backend consolidated report data unavailable; using local fallback.', error)
      await exportConsolidatedReport({
        batch,
        assessmentStats,
        toppers,
        feedback: batch.feedback,
      })
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Reports</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Batch Reports</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Export attendance from the attendance section, or download assessment, topper, and consolidated reports here.
          </p>
        </div>
        <FileText className="hidden h-8 w-8 text-cyan-300 lg:block" />
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ReportButton
          label="Assessment Report"
          onClick={() => runExport('Assessment Report', exportAssessment)}
        />
        <ReportButton
          label="Topper Report"
          onClick={() => runExport('Topper Report', exportTopper)}
        />
        <ReportButton
          label="Consolidated Report"
          onClick={() => runExport('Consolidated Report', exportConsolidated)}
        />
      </div>
    </section>
  )
}

function ReportButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  )
}
