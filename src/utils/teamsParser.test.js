import { describe, expect, it } from 'vitest'
import {
  filterParticipantsByDuration,
  parseDurationToMinutes,
  parseTeamsAttendanceRows,
} from './teamsParser.js'

describe('teamsParser', () => {
  it('parses Teams duration formats into minutes', () => {
    expect(parseDurationToMinutes('1h 30m')).toBe(90)
    expect(parseDurationToMinutes('00:45:30')).toBe(46)
    expect(parseDurationToMinutes('35')).toBe(35)
  })

  it('normalizes Teams attendance rows and filters by minimum duration', () => {
    const rows = parseTeamsAttendanceRows([
      {
        'Full Name': 'Asha Rao',
        Email: 'ASHA@example.com',
        'Emp ID': 'EMP-001',
        Duration: '1h 5m',
      },
      {
        'Full Name': 'Dev Menon',
        Email: 'dev@example.com',
        Duration: '10m',
      },
    ], 'React Basics')

    expect(rows).toMatchObject([
      {
        trainingName: 'React Basics',
        empId: 'EMP-001',
        name: 'Asha Rao',
        email: 'asha@example.com',
        durationMinutes: 65,
      },
      {
        name: 'Dev Menon',
        durationMinutes: 10,
      },
    ])
    expect(filterParticipantsByDuration(rows, 30)).toHaveLength(1)
  })
})
