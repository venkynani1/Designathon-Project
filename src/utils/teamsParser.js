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

function parseClockDuration(value) {
  const parts = String(value).trim().split(':').map(Number)

  if (parts.some(Number.isNaN)) {
    return 0
  }

  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60
  }

  if (parts.length === 2) {
    return parts[0] + parts[1] / 60
  }

  return parts[0] || 0
}

export function parseDurationToMinutes(duration) {
  const value = String(duration ?? '').trim().toLowerCase()

  if (!value) {
    return 0
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }

  if (value.includes(':')) {
    return Math.round(parseClockDuration(value))
  }

  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/)?.[1] ?? 0)
  const minutes = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/)?.[1] ?? 0)
  const seconds = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)/)?.[1] ?? 0)

  return Math.round(hours * 60 + minutes + seconds / 60)
}

export function parseTeamsAttendanceRows(dataArray, trainingName = '') {
  return dataArray
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim()))
    .map((row, index) => {
      const name = getValue(row, [
        'Full Name',
        'Name',
        'Participant',
        'Participant Name',
        'Display Name',
        'User Name',
      ])
      const email = getValue(row, [
        'Email',
        'User Principal Name',
        'UPN',
        'Participant Email',
        'User Email',
      ]).toLowerCase()
      const empId = getValue(row, [
        'Emp_Id',
        'Emp ID',
        'EMP_ID',
        'Employee ID',
        'Employee Number',
        'Personnel Number',
      ])
      const durationLabel = getValue(row, [
        'In-Meeting Duration',
        'In Meeting Duration',
        'Duration',
        'Total Duration',
        'Meeting Duration',
      ])
      const firstJoin = getValue(row, ['First Join', 'Join Time', 'Join Timestamp', 'Timestamp'])
      const lastLeave = getValue(row, ['Last Leave', 'Leave Time', 'Leave Timestamp'])
      const role = getValue(row, ['Role'])

      return {
        id: email || empId || `${name || 'participant'}-${index}`,
        trainingName,
        empId,
        name,
        email,
        duration: durationLabel,
        durationMinutes: parseDurationToMinutes(durationLabel),
        firstJoin,
        lastLeave,
        role,
        raw: row,
      }
    })
    .filter((participant) => participant.name || participant.email)
}

export function filterParticipantsByDuration(participants, minDuration) {
  const minimumMinutes = Number(minDuration) || 0

  return participants.filter(
    (participant) => Number(participant.durationMinutes ?? 0) >= minimumMinutes,
  )
}
