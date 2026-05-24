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

function getParticipantKey(name, email) {
  return String(name || email).trim().toLowerCase()
}

function isGuestEmail(email) {
  return !email || String(email).toLowerCase().includes('guest.webex.localhost')
}

export function parseWebexDuration(durationText) {
  const value = String(durationText ?? '').trim().toLowerCase()

  if (!value) {
    return 0
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.round(Number(value))
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) {
    const parts = value.split(':').map(Number)
    if (parts.length === 2) {
      return Math.round(parts[0] * 60 + parts[1])
    }
    return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60)
  }

  const days = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:d|day|days)/)?.[1] ?? 0)
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/)?.[1] ?? 0)
  const minutes = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/)?.[1] ?? 0)
  const seconds = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)/)?.[1] ?? 0)

  return Math.round(days * 1440 + hours * 60 + minutes + seconds / 60)
}

export function parseWebexAttendanceRows(rows) {
  const groupedParticipants = new Map()

  rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim()))
    .filter((row) => {
      const sessionName = getValue(row, ['Session Name'])
      return !sessionName.toLowerCase().includes('breakout')
    })
    .forEach((row) => {
      const name = getValue(row, ['Display Name', 'Name', 'Attendee Name'])
      const email = getValue(row, ['Attendee Email', 'Email', 'Email Address']).toLowerCase()
      const durationMinutes = parseWebexDuration(
        getValue(row, ['Attendance Duration', 'Duration', 'Attended Duration']),
      )

      if (!name && !email) {
        return
      }

      const key = getParticipantKey(name, email)
      const existingParticipant = groupedParticipants.get(key)

      if (existingParticipant) {
        groupedParticipants.set(key, {
          ...existingParticipant,
          email: isGuestEmail(existingParticipant.email) && !isGuestEmail(email)
            ? email
            : existingParticipant.email,
          durationMinutes: existingParticipant.durationMinutes + durationMinutes,
        })
        return
      }

      groupedParticipants.set(key, {
        id: email || name,
        name,
        email,
        durationMinutes,
      })
    })

  return Array.from(groupedParticipants.values())
}

export function getWebexMeetingMetadata(rows, fileName = '') {
  const firstMeetingRow =
    rows.find((row) => {
      const sessionName = getValue(row, ['Session Name'])
      return !sessionName.toLowerCase().includes('breakout')
    }) ?? rows[0]

  const trainingName =
    getValue(firstMeetingRow, ['Meeting Name']) ||
    fileName.replace(/\.csv$/i, '') ||
    'Webex Attendance'
  const meetingStartTime = getValue(firstMeetingRow, [
    'Meeting Start Time',
    'Start Time',
    'Meeting Date',
  ])

  return {
    trainingName,
    date: normalizeWebexDate(meetingStartTime, fileName),
  }
}

function normalizeWebexDate(value, fileName = '') {
  if (!value) {
    const fileDate = String(fileName).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (!fileDate) return 'Unknown date'
    return normalizeWebexDate(fileDate[0])
  }

  const parsedDate = new Date(value)

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10)
  }

  const dateMatch = String(value).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)

  if (!dateMatch) {
    return String(value).slice(0, 10)
  }

  const [, month, day, year] = dateMatch
  const fullYear = year.length === 2 ? `20${year}` : year

  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
