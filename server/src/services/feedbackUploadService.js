import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

const ratingHeaders = [
  'Trainer Rating',
  'trainerRating',
  'trainer_rating',
  'rating',
  'score',
  'feedback score',
  "please rate the trainer's delivery and ability to handle the course and audience - 5 being the highest and 1 being the lowest rating:",
]

export function normalizeFeedbackRating(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const rating = Number(normalized)
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null
}

function normalizeKey(key) {
  return String(key ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getValue(row, keys) {
  const wanted = new Set(keys.map(normalizeKey))
  const match = Object.entries(row ?? {}).find(([key]) => wanted.has(normalizeKey(key)))
  return String(match?.[1] ?? '').trim()
}

function splitCsvLine(line) {
  const cells = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      cells.push(value)
      value = ''
    } else {
      value += character
    }
  }
  cells.push(value)
  return cells
}

function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  return lines.slice(1).map((line) =>
    Object.fromEntries(headers.map((header, index) => [header, splitCsvLine(line)[index] ?? ''])),
  )
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []
  const headers = worksheet.getRow(1).values.slice(1).map((value) => String(value ?? '').trim())
  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values = Object.fromEntries(
      headers.map((header, index) => [header, String(row.getCell(index + 1).text ?? '').trim()]),
    )
    if (Object.values(values).some(Boolean)) rows.push(values)
  })
  return rows
}

function resolveParticipant(batch, identity) {
  const email = identity.email.toLowerCase()
  return (batch.participants ?? []).find((participant) =>
    (identity.empId && String(participant.empId ?? '').toLowerCase() === identity.empId.toLowerCase()) ||
    (identity.supersetId && String(participant.supersetId ?? '').toLowerCase() === identity.supersetId.toLowerCase()) ||
    (email && String(participant.email ?? '').toLowerCase() === email),
  )
}

function mapRows(rows, batch) {
  return rows.map((row, index) => {
    const identity = {
      empId: getValue(row, ['EMP_ID', 'Emp ID', 'Employee ID']),
      supersetId: getValue(row, ['Superset ID']),
      name: getValue(row, ['Name', 'Emp Name', 'EMP_NAME', 'Participant']),
      email: getValue(row, ['Emp Email', 'Email', 'Official Email']),
    }
    const participant = resolveParticipant(batch, identity)
    const ratingValue = normalizeFeedbackRating(getValue(row, ratingHeaders))
    return {
      id: `feedback-upload-${Date.now()}-${index}`,
      participantId: participant?.id ?? '',
      empId: participant?.empId ?? identity.empId,
      supersetId: participant?.supersetId ?? identity.supersetId,
      name: participant?.name ?? identity.name,
      email: participant?.email ?? identity.email,
      rating: ratingValue,
      comments: getValue(row, ['Comments', 'Comment', 'Feedback', 'Any other comments:']),
      topTakeaways: getValue(row, ['Top 3 takeaways', 'What are your Top 3 takeaways from this course?']),
      improvements: getValue(row, ['Improvements', 'What could have been done better in this course?']),
      courseImpact: getValue(row, ['Course impact', 'What is the impact of this course on you?']),
      assignmentUsefulness: getValue(row, ['Assignment usefulness', 'Did the assignments provided help you practice the concepts and understand the skill better?']),
      demonstrationUsefulness: getValue(row, ['Demonstration usefulness', 'Did the demonstrations and examples of the concepts provided during the session help you understand them?']),
      trainerSupportFeedback: getValue(row, ['Trainer support feedback', 'Was the support you received from the trainer regarding your lab, course, case study, or related support appropriate and provided on time?']),
      technicalDiscussionUsefulness: getValue(row, ['Technical discussion usefulness', 'Do technical discussions happening on a daily basis help you understand the skill better?']),
      matched: Boolean(participant),
    }
  })
}

export async function parseFeedbackUploadDocument({ fileName = '', fileContentBase64 = '', batch }) {
  const extension = fileName.toLowerCase().split('.').pop()
  const supported = ['csv', 'xlsx', 'txt', 'pdf', 'docx']
  if (!supported.includes(extension)) {
    throw new Error('Upload a feedback response file in .xlsx, .csv, .pdf, .docx, or .txt format.')
  }
  const buffer = Buffer.from(fileContentBase64, 'base64')
  if (!buffer.length) throw new Error('The uploaded feedback response file is empty.')

  if (extension === 'csv') {
    const rows = parseCsv(buffer.toString('utf8'))
    return { fileType: extension, extractedText: buffer.toString('utf8'), responses: mapRows(rows, batch) }
  }
  if (extension === 'xlsx') {
    const rows = await parseWorkbook(buffer)
    return { fileType: extension, extractedText: JSON.stringify(rows), responses: mapRows(rows, batch) }
  }
  if (extension === 'txt') {
    const extractedText = buffer.toString('utf8').trim()
    return {
      fileType: extension,
      extractedText,
      responses: extractedText ? [{ id: `feedback-upload-${Date.now()}-text`, comments: extractedText, matched: false }] : [],
    }
  }

  try {
    const extractedText = extension === 'docx'
      ? (await mammoth.extractRawText({ buffer })).value.trim()
      : String((await pdfParse(buffer)).text ?? '').trim()
    return {
      fileType: extension,
      extractedText,
      responses: extractedText ? [{ id: `feedback-upload-${Date.now()}-${extension}`, comments: extractedText, matched: false }] : [],
      extractionNote: extractedText ? '' : 'Document stored without readable text content.',
    }
  } catch {
    return {
      fileType: extension,
      extractedText: '',
      responses: [],
      extractionNote: 'Document retained for feedback reporting; text extraction could not be completed.',
    }
  }
}
