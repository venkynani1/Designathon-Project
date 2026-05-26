// Verifies the webexParser.test client behavior and protects its user-facing contract.
import { describe, expect, it } from 'vitest'
import {
  getWebexMeetingMetadata,
  parseWebexAttendanceRows,
  parseWebexDuration,
} from './webexParser.js'

describe('webexParser', () => {
  it('parses Webex duration formats into minutes', () => {
    expect(parseWebexDuration('1 hr 20 min')).toBe(80)
    expect(parseWebexDuration('1 day 2 hours')).toBe(1560)
    expect(parseWebexDuration('25')).toBe(25)
  })

  it('groups duplicate attendees and ignores breakout sessions', () => {
    const rows = [
      {
        'Session Name': 'Main Session',
        'Display Name': 'Nia Paul',
        'Attendee Email': 'nia@example.com',
        'Attendance Duration': '20 min',
      },
      {
        'Session Name': 'Main Session',
        'Display Name': 'Nia Paul',
        'Attendee Email': 'nia@example.com',
        'Attendance Duration': '25 min',
      },
      {
        'Session Name': 'Breakout 1',
        'Display Name': 'Nia Paul',
        'Attendee Email': 'nia@example.com',
        'Attendance Duration': '60 min',
      },
    ]

    expect(parseWebexAttendanceRows(rows)).toEqual([
      {
        id: 'nia@example.com',
        name: 'Nia Paul',
        email: 'nia@example.com',
        durationMinutes: 45,
      },
    ])
  })

  it('extracts meeting metadata from Webex rows', () => {
    const metadata = getWebexMeetingMetadata([
      {
        'Session Name': 'Main Session',
        'Meeting Name': 'Cloud Foundations',
        'Meeting Start Time': '05/07/2026 10:00 AM',
      },
    ])

    expect(metadata).toEqual({
      trainingName: 'Cloud Foundations',
      date: '2026-05-07',
    })
  })
})
