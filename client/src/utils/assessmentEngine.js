// Implements client-side assessmentEngine workflow and data-processing behavior.
import Papa from 'papaparse'

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isInternalTraining(trainingType, batchType = '') {
  return trainingType === 'Internal' ||
    trainingType === 'Mavericks' ||
    batchType === 'Internal/Mavericks'
}

function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getValue(row, keys) {
  const entries = Object.entries(row ?? {})
  const normalizedKeys = keys.map(normalizeKey)
  const match = entries.find(([key]) => normalizedKeys.includes(normalizeKey(key)))
  return String(match?.[1] ?? '').trim()
}

function isExcelFile(file) {
  const name = file?.name?.toLowerCase?.() ?? ''
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.name?.toLowerCase().endsWith('.csv')) {
      reject(new Error('Invalid assessment file. Please upload the Excel template.'))
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          reject(new Error('Unable to read the assessment CSV. Please check the template format.'))
          return
        }

        resolve(results.data)
      },
      error: (error) => reject(error),
    })
  })
}

async function parseExcelFile(file) {
  if (!isExcelFile(file)) {
    throw new Error('Invalid assessment file. Please upload the Excel template.')
  }

  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  const buffer = await file.arrayBuffer()

  await workbook.xlsx.load(buffer)

  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const headers = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim()
  })

  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const item = {}
    headers.forEach((header, index) => {
      if (!header) return
      item[header] = row.getCell(index + 1).value ?? ''
    })

    if (Object.values(item).some((value) => String(value ?? '').trim())) {
      rows.push(item)
    }
  })

  return rows
}

async function parseAssessmentFile(file) {
  if (isExcelFile(file)) return parseExcelFile(file)
  return parseCsvFile(file)
}

function hasRequiredColumns(rows, requiredColumns) {
  const firstRow = rows.find((row) => row && Object.keys(row).length)
  if (!firstRow) return false
  const actualColumns = Object.keys(firstRow).map(normalizeKey)

  return requiredColumns.every((column) => actualColumns.includes(normalizeKey(column)))
}

export function getParticipantIdentity(participant, trainingType) {
  if (isInternalTraining(trainingType)) {
    return {
      empId: participant.empId ?? participant.EMP_ID ?? '',
      name: participant.empName ?? participant.EMP_NAME ?? participant.name ?? '',
      email: participant.officialEmail ?? participant.email ?? '',
      supersetId: participant.supersetId ?? '',
    }
  }

  return {
    empId: participant.empId ?? '',
    name: participant.name ?? participant.empName ?? '',
    email: participant.email ?? participant.personalEmail ?? '',
    supersetId: participant.supersetId ?? participant.SUPERSET_ID ?? '',
  }
}

export function findParticipantMatch(participants, rowIdentity, trainingType) {
  const rowEmpId = normalize(rowIdentity.empId)
  const rowEmail = normalize(rowIdentity.email)
  const rowName = normalize(rowIdentity.name)
  const rowSupersetId = normalize(rowIdentity.supersetId)

  return participants.find((participant) => {
    const identity = getParticipantIdentity(participant, trainingType)

    if (isInternalTraining(trainingType)) {
      return (
        (rowEmpId && normalize(identity.empId) === rowEmpId) ||
        (rowName && normalize(identity.name) === rowName) ||
        (rowEmail && normalize(identity.email) === rowEmail)
      )
    }

    return (
      (rowSupersetId && normalize(identity.supersetId) === rowSupersetId) ||
      (rowEmail && normalize(identity.email) === rowEmail) ||
      (rowName && normalize(identity.name) === rowName)
    )
  })
}

export function createAssessmentTemplateRows(participants = [], trainingType, batchType = '') {
  if (isInternalTraining(trainingType, batchType)) {
    return [
      ['Emp ID', 'Emp Name', 'Score', 'Remarks'],
      ...participants.map((participant) => {
        const identity = getParticipantIdentity(participant, trainingType)
        return [identity.empId, identity.name, '', '']
      }),
    ]
  }

  return [
    ['Superset ID', 'Emp Name', 'Score', 'Remarks'],
    ...participants.map((participant) => {
      const identity = getParticipantIdentity(participant, trainingType)
      return [identity.supersetId, identity.name, '', '']
    }),
  ]
}

export async function downloadAssessmentTemplate(batch, assessment) {
  if (!(batch.participants ?? []).length) {
    throw new Error('No participants are available in this batch. Upload participants before downloading the score template.')
  }

  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Assessment Scores')
  const rows = createAssessmentTemplateRows(batch.participants, batch.trainingType, batch.batchType)

  workbook.creator = 'Maverick Execution Platform'
  workbook.created = new Date()
  workbook.modified = new Date()

  rows.forEach((row) => worksheet.addRow(row))
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
  worksheet.columns.forEach((column) => {
    column.width = Math.max(16, ...column.values.map((value) => String(value ?? '').length + 2))
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${batch.batchId}-${assessment?.id ?? 'assessment'}-score-template.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function parseAssessmentUpload(file, batch, assessment) {
  if (!batch.participants.length) {
    throw new Error('Add batch participants before uploading assessment scores.')
  }

  if (!assessment) {
    throw new Error('Assessment setup was not found. Please refresh and try again.')
  }

  const rows = await parseAssessmentFile(file)
  const requiredColumns =
    batch.trainingType === 'Internal'
      ? ['Emp ID', 'Emp Name', 'Score', 'Remarks']
      : ['Superset ID', 'Emp Name', 'Score', 'Remarks']

  const acceptedRequiredColumns =
    batch.trainingType === 'Internal'
      ? ['Emp ID', 'Emp Name', 'Score', 'Remarks']
      : requiredColumns

  if (!rows.length) {
    throw new Error('The uploaded assessment CSV is empty.')
  }

  if (!hasRequiredColumns(rows, acceptedRequiredColumns)) {
    throw new Error(`Missing required assessment columns: ${acceptedRequiredColumns.join(', ')}.`)
  }

  const maxScore = Number(assessment.maxScore ?? 100)
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    throw new Error('Assessment max score must be greater than 0 before uploading scores.')
  }

  const seenParticipantIds = new Set()
  const previousResultsByParticipant = new Map()
  ;(batch.assessments ?? []).forEach((item) => {
    ;(item.results ?? []).forEach((result) => {
      const existing = previousResultsByParticipant.get(result.participantId) ?? []
      existing.push(result)
      previousResultsByParticipant.set(result.participantId, existing)
    })
  })
  const results = []
  const errors = []

  rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim()))
    .forEach((row, index) => {
      const rowNumber = index + 2
      const rowIdentity =
        batch.trainingType === 'Internal'
          ? {
              empId: getValue(row, ['EMP_ID', 'Emp ID', 'Employee ID']),
              name: getValue(row, ['EMP_NAME', 'Emp Name', 'Name']),
              email: getValue(row, ['Email', 'Official Email']),
            }
          : {
              empId: '',
              supersetId: getValue(row, ['Superset ID', 'SupersetID', 'SUP_ID']),
              name: getValue(row, ['Emp Name', 'Name', 'EMP_NAME']),
              email: getValue(row, ['Email', 'Email ID']),
            }
      const scoreText = getValue(row, ['Score %', 'Score', 'Score Percent'])
      const scorePercent = Number(scoreText)
      const comments = getValue(row, ['Remarks', 'Comments', 'Comment'])
      const participant = findParticipantMatch(batch.participants, rowIdentity, batch.trainingType)

      if (!participant) {
        errors.push(`Row ${rowNumber}: candidate does not exist in this batch.`)
        return
      }

      if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > maxScore) {
        errors.push(`Row ${rowNumber}: score must be between 0 and ${maxScore}.`)
        return
      }

      if (seenParticipantIds.has(participant.id)) {
        errors.push(`Row ${rowNumber}: duplicate candidate score in upload.`)
        return
      }

      seenParticipantIds.add(participant.id)
      const previousResults = previousResultsByParticipant.get(participant.id) ?? []
      const firstAttempt = previousResults[0]
      const attemptNumber = previousResults.length + 1
      const firstAttemptScore = firstAttempt?.firstAttemptScore ?? firstAttempt?.scorePercent ?? scorePercent
      const firstAttemptStatus =
        firstAttempt?.firstAttemptStatus ??
        (Number(firstAttempt?.scorePercent ?? scorePercent) >= Number(assessment.cutoffScore ?? 0)
          ? 'Cleared'
          : 'Not Cleared')

      results.push({
        participantId: participant.id,
        ...getParticipantIdentity(participant, batch.trainingType),
        scorePercent,
        attemptNumber,
        comments,
        cleared: scorePercent >= Number(assessment.cutoffScore ?? 0),
        firstAttemptScore,
        firstAttemptStatus,
        latestScore: scorePercent,
        uploadedAt: new Date().toISOString(),
      })
    })

  if (errors.length) {
    throw new Error(errors.slice(0, 5).join(' '))
  }

  return results
}

export function getAssessmentStats(batch) {
  const assessments = batch.assessments ?? []
  const latestAssessment = assessments.find((assessment) => assessment.results?.length)
  const results = assessments.flatMap((assessment) => assessment.results ?? [])
  const participantIdsWithScores = new Set(results.map((result) => result.participantId))
  const notClearedIds = new Set(
    results.filter((result) => !result.cleared).map((result) => result.participantId),
  )
  const clearedIds = new Set(
    results.filter((result) => result.cleared).map((result) => result.participantId),
  )
  const totalParticipants = batch.participants?.length ?? 0
  const remaining = Math.max(totalParticipants - participantIdsWithScores.size, 0)

  return {
    latestAssessment,
    totalParticipants,
    assessed: participantIdsWithScores.size,
    cleared: clearedIds.size,
    notCleared: notClearedIds.size,
    remaining,
    clearanceRate: totalParticipants
      ? Math.round((clearedIds.size / totalParticipants) * 100)
      : 0,
  }
}

export function calculateTopper(batch) {
  const assessments = batch.assessments ?? []
  const firstAttemptByParticipant = new Map()

  assessments.forEach((assessment) => {
    ;(assessment.results ?? []).forEach((result) => {
      if (!firstAttemptByParticipant.has(result.participantId)) {
        const firstAttemptScore = Number(result.firstAttemptScore ?? result.scorePercent ?? 0)
        const cutoffScore = Number(assessment.cutoffScore ?? 0)
        const firstAttemptStatus =
          result.firstAttemptStatus ?? (firstAttemptScore >= cutoffScore ? 'Cleared' : 'Not Cleared')

        firstAttemptByParticipant.set(result.participantId, {
          participantId: result.participantId,
          empId: result.empId,
          name: result.name,
          email: result.email,
          firstAttemptScore,
          firstAttemptStatus,
          latestScore: Number(result.latestScore ?? result.scorePercent ?? firstAttemptScore),
        })
      } else {
        const existing = firstAttemptByParticipant.get(result.participantId)
        existing.latestScore = Number(result.latestScore ?? result.scorePercent ?? existing.latestScore)
      }
    })
  })

  return Array.from(firstAttemptByParticipant.values())
    .filter((entry) => entry.firstAttemptStatus === 'Cleared')
    .map((entry) => ({
      ...entry,
      finalScore: Math.round(entry.firstAttemptScore),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
}
