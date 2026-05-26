import { Download, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  getAssessmentReportData,
  getAttendanceReportData,
  getConsolidatedReportData,
  getTopperReportData,
} from '../services/reportService'
import { calculateTopper, getAssessmentStats } from '../utils/assessmentEngine'
import {
  exportAttendanceToExcel,
  exportAssessmentReport,
  exportConsolidatedReport,
  exportFeedbackReport,
  exportTopperReport,
} from '../utils/attendanceExport'
import { createLogEntry } from '../utils/notificationEngine'

export function ReportsModule({ assessmentOnly = false, batch, onLogEvent }) {
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
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
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

      <div className={`mt-5 grid gap-3 ${assessmentOnly ? 'md:grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        <ReportButton
          label="Assessment Report"
          onClick={() => runExport('Assessment Report', exportAssessment)}
        />
        {!assessmentOnly ? (
          <>
            <ReportButton
              label="Feedback Report"
              onClick={() => runExport('Feedback Report', () => exportFeedbackReport(batch))}
            />
            <ReportButton
              label="Topper Report"
              onClick={() => runExport('Topper Report', exportTopper)}
            />
            <ReportButton
              label="Consolidated Report"
              onClick={() => runExport('Consolidated Report', exportConsolidated)}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}

export function ReportsPage({ activeRole, batches, onLogEvent }) {
  const [message, setMessage] = useState('')
  const isTrainer = activeRole === 'trainer'
  const workspaceLabel = activeRole === 'admin' ? 'Admin' : isTrainer ? 'Trainer' : 'Coordinator'

  const runBatchExport = async (batch, label, exporter) => {
    await exporter(batch)
    onLogEvent?.([
      createLogEntry({
        action: `${label.toLowerCase().replaceAll(' ', '_')}_export`,
        batchId: batch.batchId,
        message: `${label} exported for ${batch.trainingName}.`,
      }),
    ])
    setMessage(`${label} exported for ${batch.trainingName}.`)
  }

  const exportAttendance = async (batch) => {
    const source = ['External', 'Segue'].includes(batch.trainingType) ? 'Webex' : 'Teams'

    try {
      const data = await getAttendanceReportData(batch.batchId, source)
      await exportAttendanceToExcel({
        batch: data.batch ?? batch,
        dates: data.dates ?? [],
        rows: data.rows ?? [],
        source: data.source ?? source,
        summary: data.summary,
        aiSummary: data.aiSummary,
        unmatchedRecords: data.unmatchedRecords ?? [],
      })
    } catch (error) {
      console.warn('Backend attendance report data unavailable; exporting empty local fallback.', error)
      await exportAttendanceToExcel({
        batch,
        dates: [],
        rows: [],
        source,
        summary: { totalParticipants: batch.participants?.length ?? 0 },
        aiSummary: 'Attendance report data is not available yet.',
        unmatchedRecords: [],
      })
    }
  }

  const exportAssessment = async (batch) => {
    try {
      const data = await getAssessmentReportData(batch.batchId)
      await exportAssessmentReport(data.batch)
    } catch (error) {
      console.warn('Backend assessment report data unavailable; using local fallback.', error)
      await exportAssessmentReport(batch)
    }
  }

  const exportFeedback = async (batch) => {
    try {
      const data = await getConsolidatedReportData(batch.batchId)
      await exportFeedbackReport({ ...data.batch, feedback: data.feedback })
    } catch (error) {
      console.warn('Backend feedback report data unavailable; using local fallback.', error)
      await exportFeedbackReport(batch)
    }
  }

  const exportTopper = async (batch) => {
    try {
      const data = await getTopperReportData(batch.batchId)
      await exportTopperReport(data.batch, data.toppers)
    } catch (error) {
      console.warn('Backend topper report data unavailable; using local fallback.', error)
      await exportTopperReport(batch, calculateTopper(batch))
    }
  }

  const exportConsolidated = async (batch) => {
    try {
      const data = await getConsolidatedReportData(batch.batchId)
      await exportConsolidatedReport(data)
    } catch (error) {
      console.warn('Backend consolidated report data unavailable; using local fallback.', error)
      await exportConsolidatedReport({
        batch,
        assessmentStats: getAssessmentStats(batch),
        toppers: calculateTopper(batch),
        feedback: batch.feedback,
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-2 border-b border-white/10 pb-4">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Reports
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {workspaceLabel} Reports
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          {isTrainer
            ? 'Export assessment reports for your assigned batches.'
            : 'Export batch-level assessment, feedback, topper, attendance, and consolidated reports.'}
        </p>
      </header>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}

      <section className="mt-5 grid gap-3">
        {batches.map((batch) => {
          return (
            <article
              key={batch.batchId}
              className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,auto)] xl:items-center">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                    {batch.batchId}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold text-white">
                    {batch.trainingName}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {batch.startDate} to {batch.endDate} | {batch.participants?.length ?? 0} participants
                  </p>
                </div>
                <div className={`grid min-w-0 gap-2 ${isTrainer ? 'sm:grid-cols-1' : 'sm:grid-cols-2 2xl:grid-cols-3'}`}>
                  {!isTrainer ? (
                    <ReportButton
                      label="Attendance Report"
                      onClick={() => runBatchExport(
                        batch,
                        'Attendance Report',
                        exportAttendance,
                      )}
                    />
                  ) : null}
                  <ReportButton
                    label="Assessment Report"
                    onClick={() => runBatchExport(
                      batch,
                      'Assessment Report',
                      exportAssessment,
                    )}
                  />
                  {!isTrainer ? (
                    <>
                      <ReportButton
                        label="Feedback Report"
                        onClick={() => runBatchExport(
                          batch,
                          'Feedback Report',
                          exportFeedback,
                        )}
                      />
                      <ReportButton
                        label="Topper Report"
                        onClick={() => runBatchExport(
                          batch,
                          'Topper Report',
                          exportTopper,
                        )}
                      />
                      <ReportButton
                        label="Consolidated Attendance"
                        onClick={() => runBatchExport(
                          batch,
                          'Consolidated Attendance Report',
                          exportAttendance,
                        )}
                      />
                      <ReportButton
                        label="Consolidated Batch"
                        onClick={() => runBatchExport(
                          batch,
                          'Consolidated Batch Report',
                          exportConsolidated,
                        )}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function ReportButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <Download className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  )
}
