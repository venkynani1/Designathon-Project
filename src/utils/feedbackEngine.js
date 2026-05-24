import Papa from 'papaparse'
import { findParticipantMatch, getParticipantIdentity } from './assessmentEngine.js'

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

export async function parseFeedbackUpload(file, batch) {
  const rows = await parseCsvFile(file)

  if (!rows.length) {
    throw new Error('The uploaded feedback CSV is empty.')
  }

  if (
    !hasAnyColumn(rows, ['Name', 'EMP_NAME', 'Participant']) ||
    !hasAnyColumn(rows, ['Rating', 'Score', 'Feedback Score'])
  ) {
    throw new Error('Missing required feedback columns: participant name and rating are required.')
  }

  return rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim()))
    .map((row, index) => {
      const rowIdentity = {
        empId: getValue(row, ['EMP_ID', 'Emp ID', 'Employee ID']),
        name: getValue(row, ['Name', 'EMP_NAME', 'Participant']),
        email: getValue(row, ['Email', 'Official Email']),
      }
      const participant = findParticipantMatch(batch.participants, rowIdentity, batch.trainingType)
      const rating = Number(getValue(row, ['Rating', 'Score', 'Feedback Score']))
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
      const comments = getValue(row, ['Comments', 'Comment', 'Feedback'])
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
        matched: Boolean(participant),
        uploadedAt: new Date().toISOString(),
      }
    })
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
