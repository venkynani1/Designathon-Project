// Renders the TeamsAttendanceUpload client interface for training execution workflows.
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getAttendanceReport,
  uploadAttendanceSessions,
} from '../../services/attendanceService'
import { generateInsight } from '../../services/insightService'
import { getAttendanceReportData } from '../../services/reportService'
import {
  downloadAttendanceTemplate,
  parseManualAttendanceTemplate,
  prepareAttendanceReport,
  processTeamsAttendanceFiles,
  processWebexAttendanceFiles,
} from '../../utils/attendanceEngine'
import { exportAttendanceToExcel } from '../../utils/attendanceExport'
import { getBatchHealth } from '../../utils/attendanceEngine'
import {
  createAttendanceAlerts,
  createLogEntry,
  createEmailNotification,
} from '../../utils/notificationEngine'

const minimumStayOptions = [
  { label: 'No minimum', value: 0 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '60 minutes', value: 60 },
]

function getAttendanceSource(batch) {
  const type = String(batch.trainingType ?? batch.batchType ?? '').toLowerCase()
  return ['external', 'segue'].includes(type) ? 'Webex' : 'Teams'
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

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function getDeadlineLabel(deadlineTime = '10:00') {
  const [hoursText = '10', minutesText = '00'] = String(deadlineTime).split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12

  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function isAfterAttendanceDeadline(deadlineTime = '10:00') {
  const [hours = 10, minutes = 0] = String(deadlineTime).split(':').map(Number)
  const now = new Date()
  const deadline = new Date()
  deadline.setHours(hours, minutes, 0, 0)
  return now > deadline
}

function getManualIdentity(participant, trainingType) {
  const isInternal = trainingType === 'Internal'
  return {
    candidateId: isInternal
      ? participant.empId ?? participant.id ?? ''
      : participant.supersetId ?? participant.email ?? participant.id ?? '',
    empId: isInternal ? participant.empId ?? '' : participant.supersetId ?? participant.empId ?? '',
    name: isInternal ? participant.empName ?? participant.name ?? '' : participant.name ?? participant.empName ?? '',
    email: isInternal ? participant.officialEmail ?? participant.email ?? '' : participant.email ?? participant.officialEmail ?? '',
  }
}

function createManualRows(batch) {
  return (batch.participants ?? []).map((participant) => {
    const identity = getManualIdentity(participant, batch.trainingType)
    return {
      participantId: participant.id,
      candidateId: identity.candidateId,
      empId: identity.empId,
      name: identity.name,
      email: identity.email,
      status: 'Present',
      duration: '',
      remarks: '',
    }
  })
}

function createAttendanceVersion({ isLate, recordCount, source }) {
  return {
    version: Date.now(),
    source,
    submittedBy: 'Current role/user',
    submittedAt: new Date().toISOString(),
    isLate,
    recordCount,
  }
}

const riskBadgeStyles = {
  HIGH: 'border-red-400/30 bg-red-400/10 text-red-200',
  MEDIUM: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200',
  LOW: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
}

export function TeamsAttendanceUpload({
  attendanceDeadlineTime = '10:00',
  batch,
  canEdit = true,
  onLogEvent,
}) {
  const [attendanceSource, setAttendanceSource] = useState(() => getAttendanceSource(batch))
  const [minDuration, setMinDuration] = useState(30)
  const [trainingDetails, setTrainingDetails] = useState(null)
  const [apiReport, setApiReport] = useState(null)
  const [attendanceDataMode, setAttendanceDataMode] = useState('local')
  const [backendInsightSummary, setBackendInsightSummary] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [manualValidation, setManualValidation] = useState(null)
  const [manualRows, setManualRows] = useState(() => createManualRows(batch))
  const [showUnmatchedManualRows, setShowUnmatchedManualRows] = useState(false)
  const deadlineLabel = getDeadlineLabel(attendanceDeadlineTime)
  const isAfterDeadline = isAfterAttendanceDeadline(attendanceDeadlineTime)
  const attendanceVersions = trainingDetails?.attendanceVersions ?? apiReport?.attendanceVersions ?? []

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
        console.warn('Backend attendance unavailable; using in-memory attendance fallback.', error)
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
  // TODO: Replace rule-based AI summary with real Gen AI after all role flows are completed.
  const highRiskPercent = report.summary.totalParticipants
    ? Math.round((report.summary.highRisk / report.summary.totalParticipants) * 100)
    : 0

  const switchAttendanceSource = (source) => {
    setAttendanceSource(source)
    setTrainingDetails(null)
    setApiReport(null)
    setBackendInsightSummary('')
    setAttendanceDataMode('local')
    setManualValidation(null)
    setShowUnmatchedManualRows(false)
  }

  useEffect(() => {
    if (!report.dates.length) {
      onLogEvent?.(createAttendanceAlerts(batch, report, {
        deadlineLabel,
        isAfterDeadline,
      }))
    }
  }, [batch, deadlineLabel, isAfterDeadline, onLogEvent, report])

  const persistAttendanceDetails = async (nextTrainingDetails, sourceLabel, fileCount = 1) => {
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
      return null
    }

    const recordCount = nextTrainingDetails.trainingParticipant.reduce(
      (total, session) => total + session.participants.length,
      0,
    )
    const version = createAttendanceVersion({
      isLate: isAfterDeadline,
      recordCount,
      source: sourceLabel,
    })
    const mergedTrainingDetails = {
      ...nextTrainingDetails,
      attendanceVersions: [
        ...(trainingDetails?.attendanceVersions ?? []),
        version,
      ],
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
          source: sourceLabel,
          trainingName: nextTrainingDetails.trainingName,
          minimumDurationMinutes: sourceLabel === 'Manual Template' || sourceLabel === 'Manual UI' ? 0 : minDuration,
          attendanceVersion: version,
          sessions: nextTrainingDetails.trainingParticipant,
        })
        setApiReport(nextReport)

        try {
          const insight = await generateInsight(batch.batchId, {
            insightType: 'attendance_summary',
            source: sourceLabel,
          })
          setBackendInsightSummary(insight.summary)
        } catch (error) {
          console.warn('Backend insight unavailable; using attendance summary fallback.', error)
          setBackendInsightSummary('')
        }
      } catch (error) {
        console.warn('Backend attendance upload failed; using in-memory attendance fallback.', error)
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

    const processedLabel =
      sourceLabel === 'Manual UI'
        ? 'Manual attendance submitted.'
        : sourceLabel === 'Manual Template'
          ? 'Marked attendance template processed.'
          : `${fileCount} ${sourceLabel} attendance file(s) processed.`
    const lateText = isAfterDeadline ? ` Submitted after ${deadlineLabel}; marked late.` : ''
    setMessage(`${processedLabel}${lateText}`)
    if (nextReport.unmatchedRecords.length) {
      setMessage(
        `${processedLabel}${lateText} ${nextReport.unmatchedRecords.length} unmatched attendee record(s) need coordinator review.`,
      )
    }

    onLogEvent?.([
      createLogEntry({
        action: `${sourceLabel.toLowerCase().replace(/\s+/g, '_')}_attendance_submit`,
        batchId: batch.batchId,
        message: `${processedLabel} Version ${version.version} created with ${recordCount} record(s).`,
      }),
      createEmailNotification({
        batch,
        event: 'attendance_upload_success',
        message: `Attendance uploaded successfully for ${batch.trainingName}. Source: ${sourceLabel}. Records: ${recordCount}.`,
        recipients: [batch.coordinatorSpoc ?? 'Coordinator'],
        type: 'Attendance',
      }),
      ...(isAfterDeadline
        ? [
            createLogEntry({
              action: 'attendance_late',
              batchId: batch.batchId,
              category: 'alert',
              level: 'WARNING',
              message: `Attendance submitted after ${deadlineLabel} for ${batch.trainingName}; marked late.`,
              recipient: batch.coordinatorSpoc ?? 'Coordinator',
              type: 'Attendance',
            }),
          ]
        : []),
      ...createAttendanceAlerts(batch, nextReport, {
        deadlineLabel,
        isAfterDeadline,
      }),
    ])

    return nextReport
  }

  const handleFiles = async (event) => {
    const files = event.target.files

    if (!files?.length) {
      setMessage('Please select at least one attendance file.')
      return
    }

    if (!batch.participants.length) {
      setMessage('Add batch participants before uploading attendance.')
      return
    }

    setIsProcessing(true)
    setMessage('')
    setManualValidation(null)
    setShowUnmatchedManualRows(false)

    try {
      let nextTrainingDetails

      if (attendanceSource === 'Manual Template') {
        const parsedTemplate = await parseManualAttendanceTemplate(files[0], batch)
        nextTrainingDetails = parsedTemplate.trainingDetails
        setManualValidation(parsedTemplate.validation)
      } else {
        const processor =
          attendanceSource === 'Webex'
            ? processWebexAttendanceFiles
            : processTeamsAttendanceFiles
        nextTrainingDetails = await processor(files, minDuration)
      }

      await persistAttendanceDetails(nextTrainingDetails, attendanceSource, files.length)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to process ${attendanceSource} files.`)
    } finally {
      setIsProcessing(false)
      event.target.value = ''
    }
  }

  const handleTemplateDownload = async () => {
    try {
      await downloadAttendanceTemplate(batch)
      setMessage('Attendance template downloaded.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to download attendance template.')
    }
  }

  const updateManualRow = (participantId, field, value) => {
    setManualRows((currentRows) =>
      currentRows.map((row) =>
        row.participantId === participantId ? { ...row, [field]: value } : row,
      ),
    )
  }

  const submitManualAttendance = async () => {
    if (!batch.participants.length) {
      setMessage('Add batch participants before submitting attendance.')
      return
    }

    const validation = {
      totalRows: manualRows.length,
      matchedParticipants: 0,
      unmatchedRows: [],
      missingStatusCount: 0,
      invalidStatusCount: 0,
    }
    const seenKeys = new Set()
    const participants = []

    manualRows.forEach((row, index) => {
      const rowNumber = index + 1
      const key = String(row.candidateId || row.email || row.name || '').trim().toLowerCase()
      const status = String(row.status ?? '').trim().toLowerCase()

      if (!key) {
        validation.unmatchedRows.push({
          rowNumber,
          empId: row.empId,
          email: row.email,
          name: row.name,
          reason: 'Missing candidate ID',
        })
        return
      }

      if (seenKeys.has(key)) {
        validation.unmatchedRows.push({
          rowNumber,
          empId: row.empId,
          email: row.email,
          name: row.name,
          reason: 'Duplicate participant entry',
        })
        return
      }
      seenKeys.add(key)

      if (!status) {
        validation.missingStatusCount += 1
        return
      }

      if (!['present', 'absent'].includes(status)) {
        validation.invalidStatusCount += 1
        return
      }

      validation.matchedParticipants += 1
      if (status === 'present') {
        participants.push({
          id: row.email || row.empId || row.name,
          empId: row.empId,
          name: row.name,
          email: row.email,
          duration: row.duration,
          durationMinutes: Number(row.duration) || 0,
          raw: {
            source: 'Manual UI',
            remarks: row.remarks,
          },
        })
      }
    })

    setManualValidation(validation)
    setShowUnmatchedManualRows(false)

    if (validation.unmatchedRows.length || validation.missingStatusCount || validation.invalidStatusCount) {
      setMessage('Manual attendance has validation issues. Fix the summary items before submitting.')
      return
    }

    await persistAttendanceDetails(
      {
        source: 'Manual UI',
        trainingName: batch.trainingName,
        trainingParticipant: [
          {
            date: getTodayDate(),
            participants,
          },
        ],
        dateCount: 1,
      },
      'Manual UI',
      1,
    )
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
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            Attendance
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Attendance Upload
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Upload Teams/Webex CSV exports or download a participant-based Excel template for manual marking.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
          {canEdit ? (
            <>
              <label className="block min-w-0 xl:w-36">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Source
                </span>
                <select
                  value={attendanceSource}
                  onChange={(event) => switchAttendanceSource(event.target.value)}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                >
                  <option value="Teams">Teams CSV</option>
                  <option value="Webex">Webex CSV</option>
                  <option value="Manual Template">Manual Template Excel</option>
                </select>
              </label>
              {attendanceSource !== 'Manual Template' ? (
                <label className="block min-w-0 xl:w-44">
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
              ) : null}
              <button
                type="button"
                onClick={handleTemplateDownload}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-medium text-cyan-100 outline-none transition hover:bg-cyan-300/15 focus-visible:ring-2 focus-visible:ring-cyan-300 sm:self-end"
              >
                <Download className="h-4 w-4" />
                Template
              </button>
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-within:ring-2 focus-within:ring-cyan-300 sm:self-end">
                <Upload className="h-4 w-4" />
                {attendanceSource === 'Manual Template'
                  ? 'Upload Template'
                  : `Upload ${attendanceSource} CSV`}
                <input
                  multiple={attendanceSource !== 'Manual Template'}
                  accept={
                    attendanceSource === 'Manual Template'
                      ? '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
                      : '.csv,text/csv'
                  }
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
      {isProcessing ? <p className="mt-4 text-sm text-zinc-400">Processing {attendanceSource} files...</p> : null}

      {canEdit ? (
        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Manual Attendance Entry</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Deadline: {deadlineLabel}. Late submissions are allowed and marked in the audit trail.
              </p>
            </div>
            <button
              type="button"
              onClick={submitManualAttendance}
              disabled={batch.status !== 'Running'}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-black outline-none transition hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Submit attendance
            </button>
          </div>
          <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#11141b] text-xs uppercase tracking-[0.14em] text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Candidate ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {manualRows.map((row) => (
                  <tr key={row.participantId} className="text-zinc-300">
                    <td className="px-3 py-2 font-medium text-white">{row.candidateId || '-'}</td>
                    <td className="px-3 py-2">{row.name || row.email || '-'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={row.status}
                        onChange={(event) => updateManualRow(row.participantId, 'status', event.target.value)}
                        className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-cyan-300"
                      >
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.duration}
                        onChange={(event) => updateManualRow(row.participantId, 'duration', event.target.value)}
                        className="h-9 w-24 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-cyan-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.remarks}
                        onChange={(event) => updateManualRow(row.participantId, 'remarks', event.target.value)}
                        className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-cyan-300"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {manualValidation ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-5">
            <span>Total rows: <strong className="text-white">{manualValidation.totalRows}</strong></span>
            <span>Matched: <strong className="text-white">{manualValidation.matchedParticipants}</strong></span>
            <span>Unmatched: <strong className="text-white">{manualValidation.unmatchedRows.length}</strong></span>
            <span>Missing status: <strong className="text-white">{manualValidation.missingStatusCount}</strong></span>
            <span>Invalid status: <strong className="text-white">{manualValidation.invalidStatusCount}</strong></span>
          </div>
          {manualValidation.unmatchedRows.length ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowUnmatchedManualRows((value) => !value)}
                className="text-sm font-medium text-cyan-200 hover:text-cyan-100"
              >
                {showUnmatchedManualRows ? 'Hide' : 'Show'} unmatched rows
              </button>
              {showUnmatchedManualRows ? (
                <ul className="mt-3 max-h-32 space-y-2 overflow-auto text-xs text-zinc-400">
                  {manualValidation.unmatchedRows.slice(0, 12).map((row) => (
                    <li key={`${row.rowNumber}-${row.name}-${row.email}`}>
                      Row {row.rowNumber}: {row.empId || row.supersetId || row.email || row.name || 'Unknown'} - {row.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-medium text-white">Source: {report.source}</p>
        <p className="mt-2 text-sm text-zinc-300">
          Attendance versions: {attendanceVersions.length || 0}
        </p>
        <p className={`mt-2 text-sm ${health.tone === 'critical' ? 'text-red-200' : 'text-zinc-300'}`}>
          Critical: {highRiskPercent}% of candidates are high risk.
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          AI Summary: {insightSummary}
        </p>
      </div>

      <div className="mt-5 max-h-[520px] overflow-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#11141b] text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="w-[10%] px-3 py-3 font-medium">Emp_Id</th>
              <th className="w-[14%] px-3 py-3 font-medium">Name</th>
              <th className="w-[8%] px-3 py-3 font-medium">Duration</th>
              <th className="w-[8%] px-3 py-3 font-medium">Sessions</th>
              <th className="w-[8%] px-3 py-3 font-medium">Days Present</th>
              <th className="w-[8%] px-3 py-3 font-medium">Attendance %</th>
              <th className="w-[8%] px-3 py-3 font-medium">Assessment %</th>
              <th className="w-[10%] px-3 py-3 font-medium">Assessment Status</th>
              <th className="w-[8%] px-3 py-3 font-medium">Absences</th>
              <th className="w-[8%] px-3 py-3 font-medium">Risk</th>
              <th className="w-[10%] px-3 py-3 font-medium">Risk Reason</th>
              <th className="w-[10%] px-3 py-3 font-medium">Recommended Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {report.rows.map((row) => (
              <tr key={`${row.empId}-${row.email}-${row.name}`} className="text-zinc-300">
                <td className="truncate px-3 py-3 font-medium text-white">{row.empId || '-'}</td>
                <td className="truncate px-3 py-3">{row.name}</td>
                <td className="px-3 py-3">{formatMinutes(row.totalDuration)}</td>
                <td className="px-3 py-3">{row.SESSIONCOUNT}</td>
                <td className="px-3 py-3">{row.PRESENTCOUNT}</td>
                <td className="px-3 py-3">
                  {row.attendancePercent === null ? '-' : `${row.attendancePercent}%`}
                </td>
                <td className="px-3 py-3">
                  {row.assessmentScore === null ? '-' : `${row.assessmentScore}%`}
                </td>
                <td className="px-3 py-3">{row.assessmentStatus}</td>
                <td className="px-3 py-3">{row.consecutiveAbsences}</td>
                <td className="px-3 py-3">
                  <RiskBadge riskLevel={row.riskLevel} />
                </td>
                <td className="truncate px-3 py-3 text-zinc-400">{row.riskReason}</td>
                <td className="truncate px-3 py-3 text-zinc-400">
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
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#11141b] text-xs uppercase tracking-[0.14em] text-zinc-500">
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
          {attendanceSource === 'Manual Template'
            ? 'Download the attendance template, mark Present or Absent, then upload the completed Excel file.'
            : `Upload one or more ${attendanceSource} CSV attendance files.`}
        </div>
      ) : null}
    </section>
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
