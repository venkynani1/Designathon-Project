function getAttendanceDeadline(settings = {}) {
  return settings.attendanceDeadlineTime ?? '10:00'
}

function recipientForBatch(batch) {
  return batch.coordinatorSpoc ? [batch.coordinatorSpoc] : ['Training Coordinator']
}

export function evaluateAttendanceRules({ batch, report, settings = {} }) {
  const notifications = []
  const deadline = getAttendanceDeadline(settings)

  if (!report.dates?.length) {
    notifications.push({
      event: 'attendance_not_uploaded_before_cutoff',
      type: 'Attendance',
      recipients: recipientForBatch(batch),
      message: `Attendance is not uploaded for ${batch.trainingName} before cutoff ${deadline}.`,
      status: 'Mock Sent',
    })
  }

  ;(report.rows ?? []).forEach((row) => {
    if (row.attendancePercent !== null && row.attendancePercent < 75) {
      notifications.push({
        event: 'low_attendance',
        type: 'Attendance',
        recipients: recipientForBatch(batch),
        message: `${row.name || row.email} has low attendance at ${row.attendancePercent}%.`,
        status: 'Mock Sent',
      })
    }

    if (row.consecutiveAbsences >= 3) {
      notifications.push({
        event: 'three_consecutive_absences',
        type: 'Attendance',
        recipients: recipientForBatch(batch),
        message: `${row.name || row.email} has ${row.consecutiveAbsences} consecutive absences.`,
        status: 'Mock Sent',
      })
    }
  })

  return notifications
}

export function evaluateOnboardingRules({ batch }) {
  return (batch.participants ?? [])
    .filter((participant) => !participant.isOnboarded)
    .map((participant) => ({
      event: 'participant_not_onboarded',
      type: 'Onboarding',
      recipients: [
        participant.placementOfficerEmail,
        batch.coordinatorSpoc,
        'Training Coordinator',
      ].filter(Boolean),
      message: `${participant.name} is not onboarded for ${batch.trainingName}. Current status: ${participant.onboardingStatus ?? 'Pending'}.`,
      status: 'Mock Sent',
    }))
}
