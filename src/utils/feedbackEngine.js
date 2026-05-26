import Papa from 'papaparse'
import { findParticipantMatch, getParticipantIdentity } from './assessmentEngine.js'

export const FEEDBACK_QUESTIONS = [
  'What are your Top 3 takeaways from this course?',
  'What could have been done better in this course?',
  'What is the impact of this course on you?',
  "Please rate the trainer's delivery and ability to handle the course and audience - 5 being the highest and 1 being the lowest rating:",
  'Did the assignments provided help you practice the concepts and understand the skill better?',
  'Did the demonstrations and examples of the concepts provided during the session help you understand them?',
  'Was the support you received from the trainer regarding your lab, course, case study, or related support appropriate and provided on time?',
  'Do technical discussions happening on a daily basis help you understand the skill better?',
  'Any other comments:',
]

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

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.name?.toLowerCase().endsWith('.csv')) {
      reject(new Error('Invalid feedback file. Please upload a CSV report.'))
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          reject(new Error('Unable to read the feedback CSV. Please check the report format.'))
          return
        }

        resolve(results.data)
      },
      error: (error) => reject(error),
    })
  })
}

function hasAnyColumn(rows, columns) {
  const firstRow = rows.find((row) => row && Object.keys(row).length)
  if (!firstRow) return false
  const normalizedColumns = columns.map(normalizeKey)

  return Object.keys(firstRow).some((key) => normalizedColumns.includes(normalizeKey(key)))
}

function isInternalBatch(batch) {
  return batch.trainingType === 'Internal' ||
    batch.trainingType === 'Mavericks' ||
    batch.batchType === 'Internal/Mavericks'
}

export async function parseFeedbackUpload(file, batch) {
  const rows = await parseCsvFile(file)

  if (!rows.length) {
    throw new Error('The uploaded feedback CSV is empty.')
  }

  if (
    !hasAnyColumn(rows, ['Name', 'Emp Name', 'EMP_NAME', 'Participant']) ||
    !hasAnyColumn(rows, [FEEDBACK_QUESTIONS[3], 'Rating', 'Score', 'Feedback Score'])
  ) {
    throw new Error('Missing required feedback columns: participant name and rating are required.')
  }

  return rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim()))
    .map((row, index) => {
      const rowIdentity = {
        empId: getValue(row, ['EMP_ID', 'Emp ID', 'Employee ID']),
        supersetId: getValue(row, ['Superset ID']),
        name: getValue(row, ['Name', 'Emp Name', 'EMP_NAME', 'Participant']),
        email: getValue(row, ['Emp Email', 'Email', 'Official Email']),
      }
      const participant = findParticipantMatch(batch.participants, rowIdentity, batch.trainingType)
      const rating = Number(getValue(row, [FEEDBACK_QUESTIONS[3], 'Rating', 'Score', 'Feedback Score']))
      const contentQualityRating = Number(getValue(row, [
        'Training Content Quality',
        'Content Quality',
        'Content Rating',
      ]))
      const trainerEffectivenessRating = Number(getValue(row, [
        'Trainer Effectiveness',
        'Trainer Rating',
        'Effectiveness Rating',
      ]))
      const comments = getValue(row, [FEEDBACK_QUESTIONS[8], 'Comments', 'Comment', 'Feedback'])
      const safeRating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : null

      return {
        id: `${Date.now()}-${index}`,
        participantId: participant?.id ?? '',
        ...(participant
          ? getParticipantIdentity(participant, batch.trainingType)
          : rowIdentity),
        rating: safeRating,
        contentQualityRating: Number.isFinite(contentQualityRating)
          ? Math.max(0, Math.min(5, contentQualityRating))
          : safeRating,
        trainerEffectivenessRating: Number.isFinite(trainerEffectivenessRating)
          ? Math.max(0, Math.min(5, trainerEffectivenessRating))
          : safeRating,
        comments,
        topTakeaways: getValue(row, [FEEDBACK_QUESTIONS[0], 'Top 3 takeaways']),
        improvements: getValue(row, [FEEDBACK_QUESTIONS[1], 'Improvements']),
        courseImpact: getValue(row, [FEEDBACK_QUESTIONS[2], 'Course impact']),
        assignmentUsefulness: getValue(row, [FEEDBACK_QUESTIONS[4], 'Assignment usefulness']),
        demonstrationUsefulness: getValue(row, [FEEDBACK_QUESTIONS[5], 'Demonstration usefulness']),
        trainerSupportFeedback: getValue(row, [FEEDBACK_QUESTIONS[6], 'Trainer support feedback']),
        technicalDiscussionUsefulness: getValue(row, [FEEDBACK_QUESTIONS[7], 'Technical discussion usefulness']),
        matched: Boolean(participant),
        uploadedAt: new Date().toISOString(),
      }
    })
}

export function createFeedbackEligibleTemplateRows(batch) {
  const internal = isInternalBatch(batch)
  const participantType = internal ? 'Internal' : batch.trainingType
  return [
    internal
      ? ['Emp ID', 'Emp Name', 'Emp Email']
      : ['Superset ID', 'Emp Name', 'Emp Email'],
    ...(batch.participants ?? []).map((participant) => {
      const identity = getParticipantIdentity(participant, participantType)
      return internal
        ? [identity.empId, identity.name, identity.email]
        : [identity.supersetId, identity.name, identity.email]
    }),
  ]
}

export async function downloadFeedbackTriggerTemplate(batch) {
  if (!(batch.participants ?? []).length) {
    throw new Error('No participants are available in this batch. Upload participants before downloading the eligible participant template.')
  }

  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Eligible Participants')
  createFeedbackEligibleTemplateRows(batch).forEach((row) => worksheet.addRow(row))
  worksheet.getRow(1).font = { bold: true }
  worksheet.columns = [
    { width: 20 },
    { width: 30 },
    { width: 36 },
  ]
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = `${batch.batchId}-feedback-eligible-participants-template.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function parseFeedbackTriggerUpload(file, batch) {
  if (!file?.name?.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Invalid feedback participant file. Please upload the Excel template.')
  }
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]
  if (!worksheet || worksheet.rowCount < 2) throw new Error('The feedback participant template is empty.')
  const headers = worksheet.getRow(1).values.slice(1).map((header) => String(header ?? '').trim())
  const internal = isInternalBatch(batch)
  const required = internal
    ? ['Emp ID', 'Emp Name', 'Emp Email']
    : ['Superset ID', 'Emp Name', 'Emp Email']
  if (required.some((header) => !headers.includes(header))) {
    throw new Error(`Missing required feedback trigger columns: ${required.join(', ')}.`)
  }
  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values = Object.fromEntries(headers.map((header, index) => [header, String(row.getCell(index + 1).value ?? '').trim()]))
    if (!Object.values(values).some(Boolean)) return
    const identity = internal
      ? { empId: values['Emp ID'], name: values['Emp Name'], email: values['Emp Email'] }
      : { supersetId: values['Superset ID'], name: values['Emp Name'], email: values['Emp Email'] }
    const participant = findParticipantMatch(batch.participants, identity, internal ? 'Internal' : batch.trainingType)
    if (!participant) throw new Error(`Row ${rowNumber}: participant does not belong to this batch.`)
    rows.push({ participantId: participant.id, email: identity.email })
  })
  if (!rows.length) throw new Error('Add at least one eligible participant before triggering feedback.')
  return rows
}

export function generateFeedbackSummary(responses = []) {
  if (!responses.length) {
    return 'Feedback has not been uploaded yet.'
  }

  const average = (values) => {
    const ratings = values.filter((rating) => Number.isFinite(rating))
    return ratings.length
      ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
      : 'N/A'
  }
  const ratings = responses
    .map((response) => response.rating)
    .filter((rating) => Number.isFinite(rating))
  const averageRating = average(ratings)
  const averageContentQuality = average(
    responses.map((response) => response.contentQualityRating ?? response.rating),
  )
  const averageTrainerEffectiveness = average(
    responses.map((response) => response.trainerEffectivenessRating ?? response.rating),
  )
  const unmatched = responses.filter((response) => !response.matched).length
  const comments = responses.filter((response) => response.comments).length

  return `Average feedback rating is ${averageRating}/5 from ${responses.length} responses. Training content quality average is ${averageContentQuality}/5. Trainer effectiveness average is ${averageTrainerEffectiveness}/5. ${comments} responses include comments. ${unmatched} responses need roster review.`
}

export function getFeedbackAnalysis(feedback = {}) {
  const responses = feedback.responses ?? []
  const average = (values) => {
    const ratings = values
      .map((value) => Number(value))
      .filter((rating) => Number.isFinite(rating))

    return ratings.length
      ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
      : 'N/A'
  }

  return {
    responseCount: responses.length,
    averageContentQuality: average(
      responses.map((response) => response.contentQualityRating ?? response.rating),
    ),
    averageTrainerEffectiveness: average(
      responses.map((response) => response.trainerEffectivenessRating ?? response.rating),
    ),
    commentsCount: responses.filter((response) => response.comments).length,
  }
}
