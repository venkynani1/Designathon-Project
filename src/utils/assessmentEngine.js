import Papa from 'papaparse'

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
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

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.name?.toLowerCase().endsWith('.csv')) {
      reject(new Error('Invalid assessment file. Please upload the CSV template.'))
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

function hasRequiredColumns(rows, requiredColumns) {
  const firstRow = rows.find((row) => row && Object.keys(row).length)
  if (!firstRow) return false
  const actualColumns = Object.keys(firstRow).map(normalizeKey)

  return requiredColumns.every((column) => actualColumns.includes(normalizeKey(column)))
}

export function getParticipantIdentity(participant, trainingType) {
  if (trainingType === 'Internal') {
    return {
      empId: participant.empId ?? participant.EMP_ID ?? '',
      name: participant.empName ?? participant.EMP_NAME ?? participant.name ?? '',
      email: participant.officialEmail ?? participant.email ?? '',
    }
  }

  return {
    empId: participant.empId ?? '',
    name: participant.name ?? participant.empName ?? '',
    email: participant.email ?? participant.personalEmail ?? '',
  }
}

export function findParticipantMatch(participants, rowIdentity, trainingType) {
  const rowEmpId = normalize(rowIdentity.empId)
  const rowEmail = normalize(rowIdentity.email)
  const rowName = normalize(rowIdentity.name)

  return participants.find((participant) => {
    const identity = getParticipantIdentity(participant, trainingType)

    return (
      (rowEmpId && normalize(identity.empId) === rowEmpId) ||
      (rowEmail && normalize(identity.email) === rowEmail) ||
      (rowName && normalize(identity.name) === rowName)
    )
  })
}

export function createAssessmentTemplateRows(participants, trainingType) {
  if (trainingType === 'Internal') {
    return [
      ['EMP_ID', 'EMP_NAME', 'Score %', 'Comments'],
      ...participants.map((participant) => {
        const identity = getParticipantIdentity(participant, trainingType)
        return [identity.empId, identity.name, '', '']
      }),
    ]
  }

  return [
    ['Name', 'Email', 'Score %', 'Comments'],
    ...participants.map((participant) => {
      const identity = getParticipantIdentity(participant, trainingType)
      return [identity.name, identity.email, '', '']
    }),
  ]
}

export function downloadAssessmentTemplate(batch) {
  const rows = createAssessmentTemplateRows(batch.participants, batch.trainingType)
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','),
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${batch.batchId}-assessment-template.csv`
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

  if (assessment.results?.length) {
    throw new Error('This assessment already has uploaded scores.')
  }

  const rows = await parseCsvFile(file)
  const requiredColumns =
    batch.trainingType === 'Internal'
      ? ['EMP_ID', 'EMP_NAME', 'Score %', 'Comments']
      : ['Name', 'Email', 'Score %', 'Comments']

  if (!rows.length) {
    throw new Error('The uploaded assessment CSV is empty.')
  }

  if (!hasRequiredColumns(rows, requiredColumns)) {
    throw new Error(`Missing required assessment columns: ${requiredColumns.join(', ')}.`)
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
              name: getValue(row, ['Name', 'EMP_NAME']),
              email: getValue(row, ['Email']),
            }
      const scoreText = getValue(row, ['Score %', 'Score', 'Score Percent'])
      const scorePercent = Number(scoreText)
      const comments = getValue(row, ['Comments', 'Comment'])
      const participant = findParticipantMatch(batch.participants, rowIdentity, batch.trainingType)

      if (!participant) {
        errors.push(`Row ${rowNumber}: candidate does not exist in this batch.`)
        return
      }

      if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
        errors.push(`Row ${rowNumber}: score must be between 0 and 100.`)
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
