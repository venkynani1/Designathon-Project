import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getAttendanceReport,
  uploadAttendanceSessions,
} from '../../services/attendanceService'
import { generateInsight } from '../../services/insightService'
import { getAttendanceReportData } from '../../services/reportService'
import {
  prepareAttendanceReport,
  processTeamsAttendanceFiles,
  processWebexAttendanceFiles,
} from '../../utils/attendanceEngine'
import { exportAttendanceToExcel } from '../../utils/attendanceExport'
import { getBatchHealth, getHealthBadgeClasses } from '../../utils/attendanceEngine'
import { createAttendanceAlerts, createLogEntry } from '../../utils/notificationEngine'
import { loadFromStorage, saveToStorage } from '../../utils/storage'

const minimumStayOptions = [
  { label: 'No minimum', value: 0 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '60 minutes', value: 60 },
]

function getAttendanceSource(batch) {
  return ['External', 'Segue'].includes(batch.trainingType) ? 'Webex' : 'Teams'
}

function getStorageKey(batchId, source) {
  return `mavericks_${source.toLowerCase()}_attendance_${batchId}`
}

function formatMinutes(minutes) {
  const value = Number(minutes) || 0
  const hours = Math.floor(value / 60)
  const remainingMinutes = value % 60

  if (hours <= 0) {
    return `${remainingMinutes}m`
  }

  return `${hours}h ${remainingMinutes}m`
}

const riskBadgeStyles = {
  HIGH: 'border-red-400/30 bg-red-400/10 text-red-200',
  MEDIUM: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200',
  LOW: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
}

export function TeamsAttendanceUpload({ batch, canEdit = true, onLogEvent }) {
  const attendanceSource = getAttendanceSource(batch)
  const storageKey = getStorageKey(batch.batchId, attendanceSource)
  const [minDuration, setMinDuration] = useState(30)
  const [trainingDetails, setTrainingDetails] = useState(() =>
    loadFromStorage(storageKey, null),
  )
  const [apiReport, setApiReport] = useState(null)
  const [attendanceDataMode, setAttendanceDataMode] = useState('local')
  const [backendInsightSummary, setBackendInsightSummary] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (trainingDetails) {
      saveToStorage(storageKey, trainingDetails)
    }
  }, [storageKey, trainingDetails])

  useEffect(() => {
    let isMounted = true

    getAttendanceReport(batch.batchId, attendanceSource)
      .then(async (report) => {
        if (!isMounted) return
        setApiReport(report)
        setAttendanceDataMode('api')

        try {
          const insight = await generateInsight(batch.batchId, {
            insightType: 'attendance_summary',
            source: attendanceSource,
          })
          if (isMounted) setBackendInsightSummary(insight.summary)
        } catch (error) {
          console.warn('Backend insight unavailable; using attendance summary fallback.', error)
          if (isMounted) setBackendInsightSummary('')
        }
      })
      .catch((error) => {
        console.warn('Backend attendance unavailable; using localStorage fallback.', error)
        if (isMounted) {
          setAttendanceDataMode('local')
          setBackendInsightSummary('')
        }
      })

    return () => {
      isMounted = false
    }
  }, [attendanceSource, batch.batchId])

  const localReport = useMemo(
    () => {
      const sourceAwareTrainingDetails = trainingDetails ?? {
        source: attendanceSource,
        trainingParticipant: [],
      }

      return prepareAttendanceReport(
        batch.participants,
        sourceAwareTrainingDetails,
        batch.trainingType,
        batch.assessments ?? [],
        batch.feedback?.summary ?? '',
      )
    },
    [
      attendanceSource,
      batch.assessments,
      batch.feedback?.summary,
      batch.participants,
      batch.trainingType,
      trainingDetails,
    ],
  )
  const report = attendanceDataMode === 'api' && apiReport ? apiReport : localReport
  const insightSummary =
    attendanceDataMode === 'api' && backendInsightSummary
      ? backendInsightSummary
      : report.aiSummary

  useEffect(() => {
    if (!report.dates.length) {
      onLogEvent?.(createAttendanceAlerts(batch, report))
    }
  }, [batch, onLogEvent, report])

  const handleFiles = async (event) => {
    const files = event.target.files

    if (!files?.length) {
      setMessage('Please select at least one attendance CSV file.')
      return
    }

    if (!batch.participants.length) {
      setMessage('Add batch participants before uploading attendance.')
      return
    }

    setIsProcessing(true)
    setMessage('')

    try {
      const processor =
        attendanceSource === 'Webex'
          ? processWebexAttendanceFiles
          : processTeamsAttendanceFiles
      const nextTrainingDetails = await processor(files, minDuration)
      const existingDates = new Set(
        (
          attendanceDataMode === 'api'
            ? apiReport?.dates?.map((date) => ({ date })) ?? []
            : trainingDetails?.trainingParticipant ?? []
        ).map((session) => session.date),
      )
      const duplicateDates = nextTrainingDetails.trainingParticipant
        .map((session) => session.date)
        .filter((date) => existingDates.has(date))

      if (duplicateDates.length) {
        setMessage(`Duplicate attendance upload detected for ${duplicateDates.join(', ')}.`)
        return
      }

      const mergedTrainingDetails = {
        ...nextTrainingDetails,
        trainingParticipant: [
          ...(trainingDetails?.trainingParticipant ?? []),
          ...nextTrainingDetails.trainingParticipant,
        ].sort((a, b) => a.date.localeCompare(b.date)),
        dateCount:
          (trainingDetails?.trainingParticipant?.length ?? 0) +
          nextTrainingDetails.trainingParticipant.length,
      }

      let nextReport = null

      if (attendanceDataMode === 'api') {
        try {
          nextReport = await uploadAttendanceSessions(batch.batchId, {
            source: attendanceSource,
            trainingName: nextTrainingDetails.trainingName,
            minimumDurationMinutes: minDuration,
            sessions: nextTrainingDetails.trainingParticipant,
          })
          setApiReport(nextReport)

          try {
            const insight = await generateInsight(batch.batchId, {
              insightType: 'attendance_summary',
              source: attendanceSource,
            })
            setBackendInsightSummary(insight.summary)
          } catch (error) {
            console.warn('Backend insight unavailable; using attendance summary fallback.', error)
            setBackendInsightSummary('')
          }
        } catch (error) {
          console.warn('Backend attendance upload failed; using localStorage fallback.', error)
          setAttendanceDataMode('local')
          setBackendInsightSummary('')
        }
      }

      if (!nextReport) {
        setTrainingDetails(mergedTrainingDetails)
        nextReport = prepareAttendanceReport(
          batch.participants,
          mergedTrainingDetails,
          batch.trainingType,
          batch.assessments ?? [],
          batch.feedback?.summary ?? '',
        )
      }

      setMessage(`${files.length} ${attendanceSource} attendance file(s) processed.`)
      if (nextReport.unmatchedRecords.length) {
        setMessage(
          `${files.length} ${attendanceSource} attendance file(s) processed. ${nextReport.unmatchedRecords.length} unmatched attendee record(s) need coordinator review.`,
        )
      }
      onLogEvent?.([
        createLogEntry({
          action: `${attendanceSource.toLowerCase()}_attendance_upload`,
          batchId: batch.batchId,
          message: `${files.length} ${attendanceSource} attendance file(s) uploaded for ${batch.trainingName}.`,
        }),
        ...createAttendanceAlerts(batch, nextReport),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to process Teams files.')
    } finally {
      setIsProcessing(false)
      event.target.value = ''
    }
  }

  const handleExport = async () => {
    let exportReport = report
    let exportBatch = batch

    if (attendanceDataMode === 'api') {
      try {
        const data = await getAttendanceReportData(batch.batchId, attendanceSource)
        exportBatch = data.batch ?? batch
        exportReport = data
      } catch (error) {
        console.warn('Backend attendance report data unavailable; using current report.', error)
      }
    }

    await exportAttendanceToExcel({
      batch: exportBatch,
      dates: exportReport.dates,
      rows: exportReport.rows,
      source: exportReport.source,
      summary: exportReport.summary,
      aiSummary:
        attendanceDataMode === 'api' && backendInsightSummary
          ? backendInsightSummary
          : exportReport.aiSummary ?? null,
      unmatchedRecords: exportReport.unmatchedRecords,
    })
  }
  const health = getBatchHealth(batch, report.summary)

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            Phase 3B
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {attendanceSource} Attendance Upload
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Upload {attendanceSource} CSV attendance reports for this batch. The live AI summary combines attendance risk, assessment cutoff status, feedback signals, and unmatched records.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {canEdit ? (
            <>
              <label className="block min-w-48">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Minimum Stay
                </span>
                <select
                  value={minDuration}
                  onChange={(event) => setMinDuration(Number(event.target.value))}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                >
                  {minimumStayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300 sm:self-end">
                <Upload className="h-4 w-4" />
                Upload {attendanceSource} Attendance
                <input
                  multiple
                  accept=".csv,text/csv"
                  type="file"
                  onChange={handleFiles}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={handleExport}
                disabled={!report.dates.length}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 sm:self-end"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
            </>
          ) : (
            <span className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400 sm:self-end">
              View only
            </span>
          )}
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-cyan-200">{message}</p> : null}
      {isProcessing ? <p className="mt-4 text-sm text-zinc-400">Processing Teams files...</p> : null}

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              Source
            </p>
            <p className="mt-2 text-sm font-medium text-white">{report.source}</p>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getHealthBadgeClasses(health.tone)}`}
            >
              {health.level}: {health.reason}
            </span>
          </div>
          <div className="sm:max-w-2xl">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              AI Summary
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {insightSummary}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SummaryCard label="Total Participants" value={report.summary.totalParticipants} />
        <SummaryCard label="Attended" value={report.summary.attended} />
        <SummaryCard label="Not Attended" value={report.summary.notAttended} />
        <SummaryCard label="High Risk" value={report.summary.highRisk} />
        <SummaryCard label="Medium Risk" value={report.summary.mediumRisk} />
        <SummaryCard label="Low Risk" value={report.summary.lowRisk} />
        <SummaryCard label="Not Cleared" value={report.summary.notCleared} />
        <SummaryCard label="Assessment Pending" value={report.summary.pendingAssessment} />
        <SummaryCard label="Unmatched" value={report.summary.unmatched} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Emp_Id</th>
              <th className="px-4 py-3 font-medium">Name</th>
              {report.dates.map((date) => (
                <th key={date} className="px-4 py-3 font-medium">
                  {date}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">No_of_Sessions</th>
              <th className="px-4 py-3 font-medium">No_of_Days_Present</th>
              <th className="px-4 py-3 font-medium">Attendance %</th>
              <th className="px-4 py-3 font-medium">Assessment %</th>
              <th className="px-4 py-3 font-medium">Assessment Status</th>
              <th className="px-4 py-3 font-medium">Consecutive Absences</th>
              <th className="px-4 py-3 font-medium">Risk Level</th>
              <th className="px-4 py-3 font-medium">Risk Reason</th>
              <th className="px-4 py-3 font-medium">Recommended Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {report.rows.map((row) => (
              <tr key={`${row.empId}-${row.email}-${row.name}`} className="text-zinc-300">
                <td className="px-4 py-3 font-medium text-white">{row.empId || '-'}</td>
                <td className="px-4 py-3">{row.name}</td>
                {report.dates.map((date) => (
                  <td key={date} className="px-4 py-3">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                        row.dateWise[date] === 'P'
                          ? 'bg-emerald-300 text-black'
                          : 'bg-white/[0.06] text-zinc-500'
                      }`}
                    >
                      {row.dateWise[date] ?? 'A'}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-3">{formatMinutes(row.totalDuration)}</td>
                <td className="px-4 py-3">{row.SESSIONCOUNT}</td>
                <td className="px-4 py-3">{row.PRESENTCOUNT}</td>
                <td className="px-4 py-3">
                  {row.attendancePercent === null ? '-' : `${row.attendancePercent}%`}
                </td>
                <td className="px-4 py-3">
                  {row.assessmentScore === null ? '-' : `${row.assessmentScore}%`}
                </td>
                <td className="px-4 py-3">{row.assessmentStatus}</td>
                <td className="px-4 py-3">{row.consecutiveAbsences}</td>
                <td className="px-4 py-3">
                  <RiskBadge riskLevel={row.riskLevel} />
                </td>
                <td className="max-w-64 px-4 py-3 text-zinc-400">{row.riskReason}</td>
                <td className="max-w-72 px-4 py-3 text-zinc-400">
                  {row.recommendedAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.unmatchedRecords.length ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-white/10">
          <div className="border-b border-white/10 bg-black/20 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Unmatched Records</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {report.source} attendees that could not be matched to the batch participant master.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Emp_Id</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {report.unmatchedRecords.map((record, index) => (
                  <tr key={`${record.date}-${record.email}-${index}`} className="text-zinc-300">
                    <td className="px-4 py-3 font-medium text-white">{record.date}</td>
                    <td className="px-4 py-3">{record.source}</td>
                    <td className="px-4 py-3">{record.empId || '-'}</td>
                    <td className="px-4 py-3">{record.name || '-'}</td>
                    <td className="px-4 py-3">{record.email || '-'}</td>
                    <td className="px-4 py-3">{formatMinutes(record.durationMinutes)}</td>
                    <td className="max-w-96 px-4 py-3 text-zinc-400">{record.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!report.dates.length ? (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
          <FileSpreadsheet className="h-5 w-5 text-cyan-300" />
          Upload one or more {attendanceSource} CSV attendance files.
        </div>
      ) : null}
    </section>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  )
}

function RiskBadge({ riskLevel }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${riskBadgeStyles[riskLevel]}`}
    >
      {riskLevel}
    </span>
  )
}
