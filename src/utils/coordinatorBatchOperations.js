export const BATCH_TEMPLATE_COLUMNS = [
  'Training Name',
  'Start Date',
  'End Date',
  'Schedule Type',
  'Custom Dates',
  'Timings',
  'Trainer Type',
  'Trainer Name',
  'Trainer Email',
  'Trainer Emp ID',
  'Trainer Unit/Competency',
  'Meeting Platform',
  'Batch Type',
]

export const INTERNAL_PARTICIPANT_COLUMNS = ['Emp ID', 'Emp Name']

export const EXTERNAL_PARTICIPANT_COLUMNS = [
  'Name',
  'Email',
  'Superset ID',
  'College Name',
  'Mobile No',
]

export const SCHEDULE_TYPES = ['All Days', 'Custom Dates']
export const TRAINER_TYPES = ['External', 'Hexavarsity']
export const MEETING_PLATFORMS = ['Teams', 'Webex']
export const BATCH_TYPES = ['Internal/Mavericks', 'External/Segue']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeAllowedValue(value, allowedValues) {
  const text = normalizeText(value)
  return allowedValues.find((allowed) => allowed.toLowerCase() === text.toLowerCase()) ?? text
}

function formatDateValue(value) {
  if (!value) return ''

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10)
}

function isValidDateText(value) {
  if (!value) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getCellValue(row, columnIndex) {
  const value = row.getCell(columnIndex).value

  if (value?.text) return value.text
  if (value?.result) return value.result
  if (value instanceof Date) return value

  return value
}

function rowsFromWorksheet(worksheet, columns) {
  const rows = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const values = columns.reduce((current, column, index) => {
      current[column] = getCellValue(row, index + 1)
      return current
    }, {})

    if (Object.values(values).every((value) => normalizeText(value) === '')) return

    rows.push({ rowNumber, values })
  })

  return rows
}

export function validateBatchTemplateRow(values, rowNumber = 2) {
  const scheduleType = normalizeAllowedValue(values['Schedule Type'], SCHEDULE_TYPES)
  const trainerType = normalizeAllowedValue(values['Trainer Type'], TRAINER_TYPES)
  const meetingPlatform = normalizeAllowedValue(values['Meeting Platform'], MEETING_PLATFORMS)
  const batchType = normalizeAllowedValue(values['Batch Type'], BATCH_TYPES)
  const startDate = formatDateValue(values['Start Date'])
  const endDate = formatDateValue(values['End Date'])
  const customDates = normalizeText(values['Custom Dates'])
  const errors = []

  if (!normalizeText(values['Training Name'])) errors.push('Training Name is required.')
  if (!isValidDateText(startDate)) errors.push('Start Date must use YYYY-MM-DD.')
  if (!isValidDateText(endDate)) errors.push('End Date must use YYYY-MM-DD.')
  if (!SCHEDULE_TYPES.includes(scheduleType)) errors.push('Schedule Type must be All Days or Custom Dates.')
  if (scheduleType === 'Custom Dates') {
    if (!customDates) {
      errors.push('Custom Dates is required for Custom Dates schedule.')
    } else {
      const invalidDates = customDates
        .split(',')
        .map((date) => normalizeText(date))
        .filter((date) => !isValidDateText(formatDateValue(date)))

      if (invalidDates.length) errors.push('Custom Dates must be comma-separated YYYY-MM-DD dates.')
    }
  }
  if (!normalizeText(values.Timings)) errors.push('Timings is required.')
  if (!TRAINER_TYPES.includes(trainerType)) errors.push('Trainer Type must be External or Hexavarsity.')
  if (!normalizeText(values['Trainer Name'])) errors.push('Trainer Name is required.')
  if (trainerType === 'External' && !normalizeText(values['Trainer Email'])) {
    errors.push('Trainer Email is required for External trainers.')
  }
  if (trainerType === 'Hexavarsity') {
    if (!normalizeText(values['Trainer Emp ID'])) {
      errors.push('Trainer Emp ID is required for Hexavarsity trainers.')
    }
    if (!normalizeText(values['Trainer Unit/Competency'])) {
      errors.push('Trainer Unit/Competency is required for Hexavarsity trainers.')
    }
  }
  if (!MEETING_PLATFORMS.includes(meetingPlatform)) errors.push('Meeting Platform must be Teams or Webex.')
  if (!BATCH_TYPES.includes(batchType)) errors.push('Batch Type must be Internal/Mavericks or External/Segue.')

  const batchIdPrefix = batchType === 'Internal/Mavericks' ? 'MB-IN' : 'MB-EX'
  const rowSuffix = String(rowNumber).padStart(3, '0')
  const dateSuffix = startDate ? startDate.replaceAll('-', '').slice(2) : Date.now().toString().slice(-6)

  return {
    batch: {
      id: `${batchIdPrefix}-${dateSuffix}-${rowSuffix}`,
      batchId: `${batchIdPrefix}-${dateSuffix}-${rowSuffix}`,
      trainingName: normalizeText(values['Training Name']),
      trainingType: batchType === 'Internal/Mavericks' ? 'Internal' : 'Segue',
      startDate,
      endDate,
      scheduleType,
      customDates,
      timings: normalizeText(values.Timings),
      status: 'Planned',
      trainerType,
      trainerName: normalizeText(values['Trainer Name']),
      trainerEmail: normalizeText(values['Trainer Email']),
      trainerEmpId: normalizeText(values['Trainer Emp ID']),
      trainerUnitOrCompetency: normalizeText(values['Trainer Unit/Competency']),
      meetingPlatform,
      batchType,
      trainer: {
        name: normalizeText(values['Trainer Name']),
        email: normalizeText(values['Trainer Email']),
        phone: '',
        specialization: normalizeText(values['Trainer Unit/Competency']),
      },
      coordinatorSpoc: '',
      meetingLink: '',
      participants: [],
    },
    errors,
    rowNumber,
  }
}

export function validateParticipantTemplateRow(values, batchType, rowNumber = 2) {
  const isInternal = batchType === 'Internal/Mavericks' || batchType === 'Internal'
  const errors = []

  if (isInternal) {
    if (!normalizeText(values['Emp ID'])) errors.push('Emp ID is required.')
    if (!normalizeText(values['Emp Name'])) errors.push('Emp Name is required.')

    return {
      errors,
      participant: {
        id: normalizeText(values['Emp ID']) || `EMP-${Date.now().toString().slice(-5)}-${rowNumber}`,
        empId: normalizeText(values['Emp ID']),
        empName: normalizeText(values['Emp Name']),
        officialEmail: '',
      },
      rowNumber,
    }
  }

  if (!normalizeText(values.Name)) errors.push('Name is required.')
  if (!normalizeText(values.Email)) errors.push('Email is required.')
  if (!normalizeText(values['Superset ID'])) errors.push('Superset ID is required.')
  if (!normalizeText(values['College Name'])) errors.push('College Name is required.')
  if (!normalizeText(values['Mobile No'])) errors.push('Mobile No is required.')

  return {
    errors,
    participant: {
      id: normalizeText(values['Superset ID']) || `EXT-${Date.now().toString().slice(-5)}-${rowNumber}`,
      name: normalizeText(values.Name),
      email: normalizeText(values.Email),
      supersetId: normalizeText(values['Superset ID']),
      collegeName: normalizeText(values['College Name']),
      mobileNumber: normalizeText(values['Mobile No']),
    },
    rowNumber,
  }
}

async function loadWorkbookFromFile(file) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  return workbook
}

export async function parseBatchTemplate(file) {
  const workbook = await loadWorkbookFromFile(file)
  const worksheet = workbook.worksheets[0]

  return rowsFromWorksheet(worksheet, BATCH_TEMPLATE_COLUMNS).map(({ rowNumber, values }) =>
    validateBatchTemplateRow(values, rowNumber),
  )
}

export async function parseParticipantTemplate(file, batchType) {
  const isInternal = batchType === 'Internal/Mavericks' || batchType === 'Internal'
  const columns = isInternal ? INTERNAL_PARTICIPANT_COLUMNS : EXTERNAL_PARTICIPANT_COLUMNS
  const workbook = await loadWorkbookFromFile(file)
  const worksheet = workbook.worksheets[0]

  return rowsFromWorksheet(worksheet, columns).map(({ rowNumber, values }) =>
    validateParticipantTemplateRow(values, batchType, rowNumber),
  )
}

function styleWorksheet(worksheet) {
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF111827' },
  }
  worksheet.columns.forEach((column) => {
    column.width = Math.max(String(column.header ?? '').length + 6, 18)
  })
}

async function createTemplateWorkbook(columns, sampleRow) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Template')
  worksheet.columns = columns.map((header) => ({ header, key: header }))
  worksheet.addRow(sampleRow)
  styleWorksheet(worksheet)
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

export async function downloadBatchTemplate() {
  const workbook = await createTemplateWorkbook(BATCH_TEMPLATE_COLUMNS, {
    'Training Name': 'Execution Excellence Foundations',
    'Start Date': '2026-05-20',
    'End Date': '2026-05-22',
    'Schedule Type': 'All Days',
    'Custom Dates': '',
    Timings: '10:00 AM - 1:00 PM',
    'Trainer Type': 'External',
    'Trainer Name': 'Avery Shah',
    'Trainer Email': 'avery.shah@example.com',
    'Trainer Emp ID': '',
    'Trainer Unit/Competency': '',
    'Meeting Platform': 'Teams',
    'Batch Type': 'Internal/Mavericks',
  })

  await downloadWorkbook(workbook, 'mavericks-batch-template.xlsx')
}

export async function downloadParticipantTemplate(type) {
  const isInternal = type === 'Internal/Mavericks' || type === 'Internal'
  const workbook = await createTemplateWorkbook(
    isInternal ? INTERNAL_PARTICIPANT_COLUMNS : EXTERNAL_PARTICIPANT_COLUMNS,
    isInternal
      ? { 'Emp ID': 'EMP-1001', 'Emp Name': 'Neha Rao' }
      : {
          Name: 'Sam Wilson',
          Email: 'sam.wilson@example.com',
          'Superset ID': 'SUP-2001',
          'College Name': 'Demo Institute',
          'Mobile No': '+91 90000 20001',
        },
  )

  await downloadWorkbook(
    workbook,
    isInternal
      ? 'mavericks-internal-participant-template.xlsx'
      : 'mavericks-external-participant-template.xlsx',
  )
}
