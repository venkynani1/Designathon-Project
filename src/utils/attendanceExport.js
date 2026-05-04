function formatMinutes(minutes) {
  const value = Number(minutes) || 0
  const hours = Math.floor(value / 60)
  const remainingMinutes = Math.round(value % 60)

  if (hours <= 0) return `${remainingMinutes}m`
  return `${hours}h ${remainingMinutes}m`
}

function getSafeAttendancePercent(value) {
  if (value === null || value === undefined) return 'N/A'
  return `${value}%`
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FF111827' } }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }
  row.alignment = { vertical: 'middle', horizontal: 'center' }
}

function applyCellBorders(worksheet) {
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  })
}

function applyAttendanceColors(worksheet, dates) {
  dates.forEach((date) => {
    worksheet.getColumn(date).eachCell((cell, rowNumber) => {
      if (rowNumber === 1) return

      if (cell.value === 'A') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' },
        }
      }

      if (cell.value === 'P') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' },
        }
      }

      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  })
}

function applyRiskColors(worksheet) {
  const riskCol = worksheet.getColumn('riskLevel').letter

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const riskCell = row.getCell(riskCol)
    const value = riskCell.value

    if (value === 'HIGH') {
      riskCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' },
      }
      riskCell.font = { bold: true, color: { argb: 'FF991B1B' } }
    } else if (value === 'MEDIUM') {
      riskCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB9C' },
      }
      riskCell.font = { bold: true, color: { argb: 'FF92400E' } }
    } else if (value === 'LOW') {
      riskCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC6EFCE' },
      }
      riskCell.font = { bold: true, color: { argb: 'FF166534' } }
    }
  })
}

function addSummarySheet(workbook, { batch, dates, rows, summary, aiSummary }) {
  const worksheet = workbook.addWorksheet('AI Summary')

  worksheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 60 },
  ]

  worksheet.addRow({ metric: 'Batch ID', value: batch?.batchId ?? 'N/A' })
  worksheet.addRow({ metric: 'Training Name', value: batch?.trainingName ?? batch?.name ?? 'N/A' })
  worksheet.addRow({ metric: 'Total Sessions', value: dates.length })
  worksheet.addRow({ metric: 'Total Participants', value: summary?.totalParticipants ?? rows.length })
  worksheet.addRow({ metric: 'Attended At Least Once', value: summary?.attended ?? 0 })
  worksheet.addRow({ metric: 'Never Attended', value: summary?.notAttended ?? 0 })
  worksheet.addRow({ metric: 'High Risk', value: summary?.highRisk ?? 0 })
  worksheet.addRow({ metric: 'Medium Risk', value: summary?.mediumRisk ?? 0 })
  worksheet.addRow({ metric: 'Low Risk', value: summary?.lowRisk ?? 0 })
  worksheet.addRow({ metric: 'Unmatched Records', value: summary?.unmatched ?? 0 })
  worksheet.addRow({ metric: 'AI Summary', value: aiSummary ?? 'No summary available.' })

  styleHeader(worksheet.getRow(1))
  applyCellBorders(worksheet)
}

function addUnmatchedSheet(workbook, unmatchedRecords = []) {
  const worksheet = workbook.addWorksheet('Unmatched Records')

  worksheet.columns = [
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Source', key: 'source', width: 14 },
    { header: 'Emp_Id', key: 'empId', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Reason', key: 'reason', width: 60 },
  ]

  if (unmatchedRecords.length === 0) {
    worksheet.addRow({
      date: '-',
      source: '-',
      empId: '-',
      name: 'No unmatched records',
      email: '-',
      reason: 'All attendance records matched successfully.',
    })
  } else {
    unmatchedRecords.forEach((record) => {
      worksheet.addRow({
        date: record.date,
        source: record.source,
        empId: record.empId,
        name: record.name,
        email: record.email,
        reason: record.reason,
      })
    })
  }

  styleHeader(worksheet.getRow(1))
  applyCellBorders(worksheet)
}

export async function exportAttendanceToExcel({
  batch,
  dates,
  rows,
  source = 'Teams',
  summary,
  aiSummary,
  unmatchedRecords = [],
}) {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Maverick Execution Platform'
  workbook.lastModifiedBy = 'Maverick AI Assistant'
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet(`${source} Attendance`)

  worksheet.columns = [
    { header: 'Emp_Id', key: 'empId', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 32 },

    ...dates.map((date) => ({ header: date, key: date, width: 12 })),

    { header: 'Total Duration', key: 'duration', width: 18 },
    { header: 'Sessions', key: 'sessionCount', width: 14 },
    { header: 'Days Present', key: 'presentCount', width: 16 },
    { header: 'Attendance %', key: 'attendancePercent', width: 16 },
    { header: 'Assessment %', key: 'assessmentScore', width: 16 },
    { header: 'Assessment Status', key: 'assessmentStatus', width: 20 },
    { header: 'Consecutive Absences', key: 'consecutiveAbsences', width: 22 },
    { header: 'Risk Level', key: 'riskLevel', width: 14 },
    { header: 'Risk Reason', key: 'riskReason', width: 44 },
    { header: 'Recommended Action', key: 'recommendedAction', width: 44 },
  ]

  rows.forEach((row) => {
    const dateValues = dates.reduce((values, date) => {
      values[date] = row.dateWise?.[date] ?? 'A'
      return values
    }, {})

    worksheet.addRow({
      empId: row.empId || '-',
      name: row.name || '-',
      email: row.email || '-',
      ...dateValues,
      duration: formatMinutes(row.totalDuration),
      sessionCount: row.SESSIONCOUNT ?? 0,
      presentCount: row.PRESENTCOUNT ?? 0,
      attendancePercent: getSafeAttendancePercent(row.attendancePercent),
      assessmentScore: getSafeAttendancePercent(row.assessmentScore),
      assessmentStatus: row.assessmentStatus ?? 'N/A',
      consecutiveAbsences: row.consecutiveAbsences ?? 0,
      riskLevel: row.riskLevel ?? 'LOW',
      riskReason: row.riskReason ?? '-',
      recommendedAction: row.recommendedAction ?? '-',
    })
  })

  styleHeader(worksheet.getRow(1))
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: 'A1',
    to: worksheet.getRow(1).getCell(worksheet.columnCount).address,
  }

  applyAttendanceColors(worksheet, dates)
  applyRiskColors(worksheet)
  applyCellBorders(worksheet)

  addSummarySheet(workbook, { batch, dates, rows, summary, aiSummary })
  addUnmatchedSheet(workbook, unmatchedRecords)

  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${batch?.batchId ?? 'batch'}-${source.toLowerCase()}-attendance.xlsx`
  link.click()

  URL.revokeObjectURL(url)
}

async function createWorkbook() {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()

  workbook.creator = 'Maverick Execution Platform'
  workbook.lastModifiedBy = 'Maverick AI Assistant'
  workbook.created = new Date()
  workbook.modified = new Date()

  return workbook
}

async function downloadWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.click()

  URL.revokeObjectURL(url)
}

export async function exportAssessmentReport(batch) {
  const workbook = await createWorkbook()
  const worksheet = workbook.addWorksheet('Assessment Report')

  worksheet.columns = [
    { header: 'Assessment', key: 'assessment', width: 28 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Cutoff Score', key: 'cutoffScore', width: 16 },
    { header: 'Max Score', key: 'maxScore', width: 14 },
    { header: 'Weightage', key: 'weightage', width: 14 },
    { header: 'Emp_Id', key: 'empId', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Score %', key: 'scorePercent', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Comments', key: 'comments', width: 44 },
  ]

  if (!batch.assessments?.length) {
    worksheet.addRow({ assessment: 'No data available' })
  }

  ;(batch.assessments ?? []).forEach((assessment) => {
    if (!assessment.results?.length) {
      worksheet.addRow({
        assessment: assessment.name,
        type: assessment.type,
        date: assessment.date,
        cutoffScore: assessment.cutoffScore,
        maxScore: assessment.maxScore,
        weightage: assessment.weightage,
        name: 'No scores uploaded',
      })
      return
    }

    assessment.results.forEach((result) => {
      worksheet.addRow({
        assessment: assessment.name,
        type: assessment.type,
        date: assessment.date,
        cutoffScore: assessment.cutoffScore,
        maxScore: assessment.maxScore,
        weightage: assessment.weightage,
        empId: result.empId || '-',
        name: result.name || '-',
        email: result.email || '-',
        scorePercent: result.scorePercent,
        status: result.cleared ? 'Cleared' : 'Not Cleared',
        comments: result.comments || '-',
      })
    })
  })

  styleHeader(worksheet.getRow(1))
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  applyCellBorders(worksheet)

  await downloadWorkbook(workbook, `${batch.batchId}-assessment-report.xlsx`)
}

export async function exportTopperReport(batch, toppers = []) {
  const workbook = await createWorkbook()
  const worksheet = workbook.addWorksheet('Topper Report')

  worksheet.columns = [
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Emp_Id', key: 'empId', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Weighted Score %', key: 'finalScore', width: 20 },
  ]

  if (!toppers.length) {
    worksheet.addRow({ rank: '-', name: 'No assessment scores uploaded yet.' })
  } else {
    toppers.forEach((topper, index) => {
      worksheet.addRow({
        rank: index + 1,
        empId: topper.empId || '-',
        name: topper.name || '-',
        email: topper.email || '-',
        finalScore: topper.finalScore,
      })
    })
  }

  styleHeader(worksheet.getRow(1))
  applyCellBorders(worksheet)

  await downloadWorkbook(workbook, `${batch.batchId}-topper-report.xlsx`)
}

export async function exportConsolidatedReport({ batch, assessmentStats, toppers, feedback }) {
  const workbook = await createWorkbook()
  const worksheet = workbook.addWorksheet('Consolidated Report')

  worksheet.columns = [
    { header: 'Metric', key: 'metric', width: 34 },
    { header: 'Value', key: 'value', width: 70 },
  ]

  worksheet.addRow({ metric: 'Batch ID', value: batch.batchId })
  worksheet.addRow({ metric: 'Training Name', value: batch.trainingName })
  worksheet.addRow({ metric: 'Training Type', value: batch.trainingType })
  worksheet.addRow({ metric: 'Trainer', value: batch.trainer?.name ?? 'N/A' })
  worksheet.addRow({ metric: 'Participants', value: batch.participants?.length ?? 0 })
  worksheet.addRow({ metric: 'Assessments', value: batch.assessments?.length ?? 0 })
  worksheet.addRow({ metric: 'Assessed Candidates', value: assessmentStats.assessed })
  worksheet.addRow({ metric: 'Cleared Candidates', value: assessmentStats.cleared })
  worksheet.addRow({ metric: 'Not Cleared Candidates', value: assessmentStats.notCleared })
  worksheet.addRow({ metric: 'Remaining Candidates', value: assessmentStats.remaining })
  worksheet.addRow({ metric: 'Assessment Clearance Rate', value: `${assessmentStats.clearanceRate}%` })
  worksheet.addRow({ metric: 'Topper', value: toppers[0]?.name ?? 'N/A' })
  worksheet.addRow({ metric: 'Topper Weighted Score', value: toppers[0] ? `${toppers[0].finalScore}%` : 'N/A' })
  worksheet.addRow({ metric: 'Feedback Responses', value: feedback?.responses?.length ?? 0 })
  worksheet.addRow({ metric: 'AI Feedback Summary', value: feedback?.summary ?? 'No feedback summary available.' })

  styleHeader(worksheet.getRow(1))
  applyCellBorders(worksheet)

  await downloadWorkbook(workbook, `${batch.batchId}-consolidated-report.xlsx`)
}
