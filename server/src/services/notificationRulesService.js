import { resolveParticipantEmail, resolvePlacementOfficerEmail } from '../utils/participantEmail.js'

function getAttendanceDeadline(settings = {}) {
  return settings.attendanceDeadlineTime ?? '10:00'
}

function recipientForBatch(batch) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(batch.coordinatorSpoc ?? '').trim())
    ? [batch.coordinatorSpoc]
    : []
}

function isExternalBatch(batch) {
  return batch.batchType
    ? batch.batchType === 'External/Segue'
    : batch.trainingType !== 'Internal'
}

function findParticipant(batch, row) {
  return (batch.participants ?? []).find((participant) =>
    (row.participantId && participant.id === row.participantId) ||
    (row.email && resolveParticipantEmail(participant) === row.email) ||
    participant.name === row.name,
  )
}

function contextForIncident(batch, participant, row, eventType, recipientType = 'participant') {
  return {
    recipientType,
    eventType,
    participantName: participant?.name ?? row.name,
    participantEmail: resolveParticipantEmail(participant ?? row),
    placementOfficerEmail: resolvePlacementOfficerEmail(participant),
    collegeName: participant?.collegeName ?? '',
    batchName: batch.trainingName,
    trainerName: batch.trainerName ?? batch.trainer?.name ?? '',
    attendancePercentage: row.attendancePercent,
    consecutiveAbsences: row.consecutiveAbsences,
    attendanceBehavior: row.riskReason,
    lowScoreDetails: row.assessmentStatus === 'Not Cleared'
      ? `Assessment score ${row.assessmentScore}% is below cutoff ${row.assessmentCutoff}%.`
      : '',
    recommendedAction: row.recommendedAction,
  }
}

function escalationForExternal(batch, participant, row, event) {
  if (!isExternalBatch(batch)) return null
  const placementOfficerEmail = resolvePlacementOfficerEmail(participant)
  if (!placementOfficerEmail) {
    console.warn(`Placement officer escalation skipped for ${participant?.id ?? row.name}: email is missing.`)
    return null
  }

  return {
    event: `placement_officer_${event}_escalation`,
    type: 'Escalation',
    participantId: participant.id,
    recipients: [placementOfficerEmail],
    message: `${participant.name} requires placement officer follow-up for ${batch.trainingName}: ${row.riskReason}.`,
    context: contextForIncident(batch, participant, row, 'placement_officer_escalation', 'placementOfficer'),
  }
}

function participantIncident(batch, participant, row, event, type = 'Attendance') {
  return {
    event,
    type,
    participantId: participant?.id ?? null,
    recipients: [resolveParticipantEmail(participant ?? row)].filter(Boolean),
    cc: recipientForBatch(batch),
    message: `${row.name || row.email} requires follow-up for ${batch.trainingName}: ${row.riskReason}.`,
    context: contextForIncident(batch, participant, row, event),
  }
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
      generateContent: false,
    })
  }

  ;(report.rows ?? []).forEach((row) => {
    const participant = findParticipant(batch, row)
    const events = []

    if (row.attendancePercent !== null && row.attendancePercent < 75) events.push(['low_attendance', 'Attendance'])
    if (row.riskLevel === 'HIGH' || row.riskLevel === 'MEDIUM') events.push(['risky_attendance_pattern', 'Attendance'])
    if (row.consecutiveAbsences >= 3) events.push(['three_consecutive_absences', 'Attendance'])
    if (row.assessmentStatus === 'Not Cleared') events.push(['low_assessment_score', 'Assessment'])

    events.forEach(([event, type]) => {
      notifications.push(participantIncident(batch, participant, row, event, type))
      const escalation = escalationForExternal(batch, participant, row, event)
      if (escalation) notifications.push(escalation)
    })
  })

  return notifications
}

export function evaluateOnboardingRules({ batch }) {
  const notifications = []

  ;(batch.participants ?? [])
    .filter((participant) => !participant.isOnboarded)
    .forEach((participant) => {
      const context = {
        recipientType: 'participant',
        eventType: 'onboarding_reminder',
        participantName: participant.name,
        participantEmail: resolveParticipantEmail(participant),
        collegeName: participant.collegeName ?? '',
        batchName: batch.trainingName,
        trainerName: batch.trainerName ?? batch.trainer?.name ?? '',
        onboardingStatus: participant.onboardingStatus ?? 'Pending',
        recommendedAction: 'Please contact your coordinator to complete onboarding.',
      }

      notifications.push({
        event: 'participant_not_onboarded',
        type: 'Onboarding',
        participantId: participant.id,
        recipients: [resolveParticipantEmail(participant)].filter(Boolean),
        cc: recipientForBatch(batch),
        message: `${participant.name} is not onboarded for ${batch.trainingName}. Current status: ${context.onboardingStatus}.`,
        context,
      })

      if (!isExternalBatch(batch)) return
      const placementOfficerEmail = resolvePlacementOfficerEmail(participant)
      if (!placementOfficerEmail) {
        console.warn(`Placement officer escalation skipped for ${participant.id}: email is missing.`)
        return
      }

      notifications.push({
        event: 'placement_officer_participant_not_onboarded_escalation',
        type: 'Escalation',
        participantId: participant.id,
        recipients: [placementOfficerEmail],
        message: `${participant.name} is not onboarded after ${batch.trainingName}.`,
        context: {
          ...context,
          recipientType: 'placementOfficer',
          eventType: 'placement_officer_escalation',
          placementOfficerEmail,
          recommendedAction: 'Please follow up with the participant and confirm onboarding completion.',
        },
      })
    })

  return notifications
}
