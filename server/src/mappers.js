function formatDate(value) {
  return value ? value.toISOString().slice(0, 10) : ''
}

export function mapParticipant(participant, trainingType) {
  const governanceFields = {
    isOnboarded: Boolean(participant.isOnboarded),
    onboardingStatus: participant.onboardingStatus ?? 'Pending',
    placementOfficerEmail: participant.placementOfficerEmail ?? '',
    collegeName: participant.collegeName ?? '',
  }

  if (trainingType === 'Internal') {
    return {
      id: participant.id,
      empId: participant.empId ?? '',
      empName: participant.name,
      officialEmail: participant.email ?? '',
      ...governanceFields,
    }
  }

  return {
    id: participant.id,
    name: participant.name,
    email: participant.email ?? '',
    supersetId: participant.supersetId ?? '',
    mobileNumber: participant.mobileNumber ?? '',
    ...governanceFields,
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
    createdAt: batch.createdAt?.toISOString?.() ?? batch.createdAt ?? '',
    updatedAt: batch.updatedAt?.toISOString?.() ?? batch.updatedAt ?? '',
    trainingName: batch.trainingName,
    trainingType: batch.trainingType,
    startDate: formatDate(batch.startDate),
    endDate: formatDate(batch.endDate),
    scheduleType: batch.scheduleType ?? 'All Days',
    customDates: batch.customDates ?? '',
    timings: batch.timings ?? '',
    status: batch.status,
    assessmentScoreDeadline:
      batch.assessmentScoreDeadline?.toISOString?.() ?? batch.assessmentScoreDeadline ?? '',
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
    assignedTrainers: Array.isArray(batch.assignedTrainers) ? batch.assignedTrainers : [],
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
    channel: log.channel ?? '',
    createdAt: log.createdAt.toISOString(),
    event: log.event ?? log.action,
    level: log.level,
    message: log.message,
    recipient: log.recipient ?? '',
    recipients: log.recipients ?? [],
    status: log.status,
    type: log.type,
  }
}

export function mapNotification(notification) {
  return {
    id: notification.id,
    batchId: notification.batchCode ?? '',
    type: notification.type,
    event: notification.event,
    participantId: notification.participantId ?? '',
    eventDate: notification.eventDate ?? '',
    channel: notification.channel,
    recipients: notification.recipients ?? [],
    message: notification.message,
    metadata: notification.metadata ?? {},
    status: notification.status,
    createdAt: notification.createdAt?.toISOString?.() ?? notification.createdAt,
  }
}

export function mapEmailLog(emailLog) {
  return {
    id: emailLog.id,
    notificationId: emailLog.notificationId ?? '',
    batchId: emailLog.batchCode ?? '',
    to: emailLog.to ?? [],
    cc: emailLog.cc ?? [],
    subject: emailLog.subject,
    body: emailLog.body,
    event: emailLog.event ?? '',
    participantId: emailLog.participantId ?? '',
    channel: emailLog.channel ?? 'Email',
    status: emailLog.status,
    provider: emailLog.provider,
    messageId: emailLog.messageId ?? '',
    error: emailLog.error ?? '',
    metadata: emailLog.metadata ?? {},
    createdAt: emailLog.createdAt?.toISOString?.() ?? emailLog.createdAt,
  }
}

export function mapTrainerProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    empId: profile.empId ?? '',
    unitOrCompetency: profile.unitOrCompetency ?? '',
    phone: profile.phone ?? '',
    specialization: profile.specialization ?? '',
    status: profile.status ?? 'Active',
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
    questionFileName: assessment.questionFileName ?? '',
    questionFileUploadedAt:
      assessment.questionFileUploadedAt?.toISOString?.() ??
      assessment.questionFileUploadedAt ??
      '',
    evidenceFiles: (assessment.evidenceFiles ?? []).map((file) => ({
      id: file.id,
      name: file.fileName,
      size: file.fileSize ?? 0,
      uploadedAt: file.uploadedAt?.toISOString?.() ?? file.uploadedAt,
    })),
    createdAt: assessment.createdAt?.toISOString?.() ?? assessment.createdAt,
  }
}

export function mapFeedbackResponse(response) {
  return {
    id: response.id,
    participantId: response.participantId ?? '',
    empId: response.empId ?? '',
    supersetId: response.supersetId ?? '',
    name: response.name ?? '',
    email: response.email ?? '',
    rating: response.rating,
    comments: response.comments ?? '',
    topTakeaways: response.topTakeaways ?? '',
    improvements: response.improvements ?? '',
    courseImpact: response.courseImpact ?? '',
    assignmentUsefulness: response.assignmentUsefulness ?? '',
    demonstrationUsefulness: response.demonstrationUsefulness ?? '',
    trainerSupportFeedback: response.trainerSupportFeedback ?? '',
    technicalDiscussionUsefulness: response.technicalDiscussionUsefulness ?? '',
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
    startAt: feedbackRun.startAt?.toISOString?.() ?? feedbackRun.startAt ?? '',
    endAt: feedbackRun.endAt?.toISOString?.() ?? feedbackRun.endAt ?? '',
    closureDeadline:
      feedbackRun.closureDeadline?.toISOString?.() ?? feedbackRun.closureDeadline ?? '',
    closedAt: feedbackRun.closedAt?.toISOString?.() ?? feedbackRun.closedAt ?? '',
    feedbackLink: feedbackRun.feedbackLink ?? '',
    eligibleParticipantIds: feedbackRun.eligibleParticipantIds ?? [],
    uploadedAt: feedbackRun.uploadedAt?.toISOString?.() ?? feedbackRun.uploadedAt ?? '',
    uploadedFileName: feedbackRun.uploadedFileName ?? '',
    summary: feedbackRun.summary ?? 'Feedback has not been uploaded yet.',
    responses: (feedbackRun.responses ?? []).map(mapFeedbackResponse),
  }
}
