function formatMinutes(minutes) {
  const value = Number(minutes) || 0
  const hours = Math.floor(value / 60)
  const remainingMinutes = value % 60

  if (hours <= 0) {
    return `${remainingMinutes}m`
  }

  return `${hours}h ${remainingMinutes}m`
}

const riskFills = {
  HIGH: 'FFFCA5A5',
  MEDIUM: 'FFFEF08A',
  LOW: 'FFBBF7D0',
}

export async function exportAttendanceToExcel({ batch, dates, rows }) {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Teams Attendance')

  worksheet.columns = [
    { header: 'Emp_Id', key: 'empId', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    ...dates.map((date) => ({ header: date, key: date, width: 14 })),
    { header: 'Duration', key: 'duration', width: 16 },
    { header: 'No_of_Sessions', key: 'sessionCount', width: 18 },
    { header: 'No_of_Days_Present', key: 'presentCount', width: 20 },
    { header: 'Attendance %', key: 'attendancePercent', width: 16 },
    { header: 'Consecutive Absences', key: 'consecutiveAbsences', width: 24 },
    { header: 'Risk Level', key: 'riskLevel', width: 16 },
    { header: 'Risk Reason', key: 'riskReason', width: 42 },
    { header: 'Recommended Action', key: 'recommendedAction', width: 44 },
  ]

  rows.forEach((row) => {
    const dateValues = dates.reduce((values, date) => {
      values[date] = row.dateWise[date] ?? 'A'
      return values
    }, {})

    const worksheetRow = worksheet.addRow({
      empId: row.empId,
      name: row.name,
      ...dateValues,
      duration: formatMinutes(row.totalDuration),
      sessionCount: row.SESSIONCOUNT,
      presentCount: row.PRESENTCOUNT,
      attendancePercent:
        row.attendancePercent === null ? '' : `${row.attendancePercent}%`,
      consecutiveAbsences: row.consecutiveAbsences,
      riskLevel: row.riskLevel,
      riskReason: row.riskReason,
      recommendedAction: row.recommendedAction,
    })

    const riskCell = worksheetRow.getCell('riskLevel')
    riskCell.font = { bold: true }
    riskCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: riskFills[row.riskLevel] ?? 'FFE5E7EB' },
    }
  })

  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${batch.batchId}-teams-attendance.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
