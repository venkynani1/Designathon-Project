function formatDate(value) {
  return value ? value.toISOString().slice(0, 10) : ''
}

export function mapParticipant(participant, trainingType) {
  if (trainingType === 'Internal') {
    return {
      id: participant.id,
      empId: participant.empId ?? '',
      empName: participant.name,
      officialEmail: participant.email ?? '',
    }
  }

  return {
    id: participant.id,
    name: participant.name,
    email: participant.email ?? '',
    supersetId: participant.supersetId ?? '',
    collegeName: participant.collegeName ?? '',
    mobileNumber: participant.mobileNumber ?? '',
  }
}

export function mapBatch(batch, options = {}) {
  const participants = options.includeParticipants
    ? (batch.participants ?? []).map((participant) =>
        mapParticipant(participant, batch.trainingType),
      )
    : undefined
  const discontinuedParticipantIds = options.includeParticipants
    ? (batch.participants ?? [])
        .filter((participant) => participant.isDiscontinued)
        .map((participant) => participant.id)
    : undefined

  return {
    id: batch.batchCode,
    batchId: batch.batchCode,
    trainingName: batch.trainingName,
    trainingType: batch.trainingType,
    startDate: formatDate(batch.startDate),
    endDate: formatDate(batch.endDate),
    scheduleType: batch.scheduleType ?? 'All Days',
    customDates: batch.customDates ?? '',
    timings: batch.timings ?? '',
    status: batch.status,
    trainerType: batch.trainerType ?? 'External',
    trainerEmpId: batch.trainerEmpId ?? '',
    trainerUnitOrCompetency:
      batch.trainerUnitOrCompetency ?? batch.trainerSpecialization ?? '',
    meetingPlatform: batch.meetingPlatform ?? '',
    batchType:
      batch.batchType ??
      (batch.trainingType === 'Internal' ? 'Internal/Mavericks' : 'External/Segue'),
    trainer: {
      name: batch.trainerName ?? '',
      email: batch.trainerEmail ?? '',
      phone: batch.trainerPhone ?? '',
      specialization: batch.trainerSpecialization ?? '',
    },
    coordinatorSpoc: batch.coordinatorSpoc ?? '',
    meetingLink: batch.meetingLink ?? '',
    ...(participants ? { participants } : {}),
    ...(discontinuedParticipantIds ? { discontinuedParticipantIds } : {}),
  }
}

export function mapLog(log) {
  return {
    id: log.id,
    action: log.action,
    batchId: log.batchCode ?? '',
    category: log.category,
    createdAt: log.createdAt.toISOString(),
    level: log.level,
    message: log.message,
    recipient: log.recipient ?? '',
    status: log.status,
    type: log.type,
  }
}

export function mapAssessmentResult(result) {
  return {
    participantId: result.participantId ?? '',
    empId: result.empId ?? '',
    name: result.name,
    email: result.email ?? '',
    scorePercent: result.scorePercent,
    comments: result.comments ?? '',
    cleared: result.cleared,
    uploadedAt: result.uploadedAt?.toISOString?.() ?? result.uploadedAt,
  }
}

export function mapAssessment(assessment) {
  return {
    id: assessment.id,
    name: assessment.name,
    type: assessment.type,
    date: formatDate(assessment.date),
    cutoffScore: assessment.cutoffScore,
    maxScore: assessment.maxScore,
    weightage: assessment.weightage,
    results: (assessment.results ?? []).map(mapAssessmentResult),
    uploadedFileName: assessment.uploadedFileName ?? '',
    uploadedAt: assessment.uploadedAt?.toISOString?.() ?? assessment.uploadedAt ?? '',
    createdAt: assessment.createdAt?.toISOString?.() ?? assessment.createdAt,
  }
}

export function mapFeedbackResponse(response) {
  return {
    id: response.id,
    participantId: response.participantId ?? '',
    empId: response.empId ?? '',
    name: response.name ?? '',
    email: response.email ?? '',
    rating: response.rating,
    comments: response.comments ?? '',
    matched: response.matched,
    uploadedAt: response.uploadedAt?.toISOString?.() ?? response.uploadedAt,
  }
}

export function mapFeedbackRun(feedbackRun) {
  if (!feedbackRun) {
    return {
      triggeredAt: '',
      responses: [],
      summary: 'Feedback has not been uploaded yet.',
    }
  }

  return {
    id: feedbackRun.id,
    triggeredAt: feedbackRun.triggeredAt?.toISOString?.() ?? feedbackRun.triggeredAt ?? '',
    uploadedAt: feedbackRun.uploadedAt?.toISOString?.() ?? feedbackRun.uploadedAt ?? '',
    uploadedFileName: feedbackRun.uploadedFileName ?? '',
    summary: feedbackRun.summary ?? 'Feedback has not been uploaded yet.',
    responses: (feedbackRun.responses ?? []).map(mapFeedbackResponse),
  }
}
