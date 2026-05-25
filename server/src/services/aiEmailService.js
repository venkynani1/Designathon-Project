const SUPPORTED_CONTEXT_FIELDS = [
  'recipientType',
  'eventType',
  'participantName',
  'participantEmail',
  'placementOfficerEmail',
  'collegeName',
  'batchName',
  'trainerName',
  'attendancePercentage',
  'consecutiveAbsences',
  'attendanceBehavior',
  'lowScoreDetails',
  'onboardingStatus',
  'feedbackLink',
  'assessmentLink',
  'dueDate',
  'recommendedAction',
]

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'html', 'text'],
  properties: {
    subject: { type: 'string' },
    html: { type: 'string' },
    text: { type: 'string' },
  },
}

function value(context, key, fallback = '') {
  const result = context[key]
  return result === null || result === undefined || result === '' ? fallback : String(result)
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function htmlFromText(text) {
  return text
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

export function createFallbackEmail(context = {}) {
  const participantName = value(context, 'participantName', 'Participant')
  const batchName = value(context, 'batchName', 'your training program')
  const trainerText = context.trainerName ? ` with ${context.trainerName}` : ''
  const action = value(context, 'recommendedAction', 'Please follow up promptly.')
  let subject
  let text

  switch (context.eventType) {
    case 'placement_officer_escalation':
      subject = `Action required: ${participantName} - ${batchName}`
      text = `Dear Placement Officer,\n\n${participantName} from ${value(context, 'collegeName', 'your institution')} requires follow-up for ${batchName}${trainerText}. ${value(context, 'attendanceBehavior', '') || value(context, 'lowScoreDetails', '') || `Current onboarding status: ${value(context, 'onboardingStatus', 'Pending')}.`}\n\nRecommended action: ${action}\n\nRegards,\nMavericks Execution Platform`
      break
    case 'feedback_request':
      subject = `Thank you for attending ${batchName} - feedback requested`
      text = `Dear ${participantName},\n\nThank you for attending ${batchName}${trainerText}. Please share your feedback using this link: ${value(context, 'feedbackLink', 'the feedback form provided by your coordinator')}.${context.dueDate ? ` Feedback closes on ${context.dueDate}.` : ''}\n\nRegards,\nMavericks Execution Platform`
      break
    case 'assessment_reminder':
    case 'upcoming_assessment_reminder':
      subject = `Assessment reminder: ${batchName}`
      text = `Dear ${participantName},\n\nYour assessment for ${batchName}${context.dueDate ? ` is scheduled or due on ${context.dueDate}` : ' is approaching'}. ${context.assessmentLink ? `Access it here: ${context.assessmentLink}` : ''}\n\n${action}\n\nRegards,\nMavericks Execution Platform`
      break
    case 'low_assessment_score':
      subject = `Assessment follow-up required: ${batchName}`
      text = `Dear ${participantName},\n\nYour assessment result for ${batchName} requires follow-up. ${value(context, 'lowScoreDetails', '')}\n\nRecommended action: ${action}\n\nRegards,\nMavericks Execution Platform`
      break
    case 'participant_not_onboarded':
    case 'onboarding_reminder':
      subject = `Onboarding follow-up: ${batchName}`
      text = `Dear ${participantName},\n\nYour onboarding status after ${batchName} is ${value(context, 'onboardingStatus', 'Pending')}. ${action}\n\nRegards,\nMavericks Execution Platform`
      break
    default:
      subject = `Attendance follow-up: ${batchName}`
      text = `Dear ${participantName},\n\nYour attendance for ${batchName} requires attention.${context.attendancePercentage !== undefined && context.attendancePercentage !== null ? ` Current attendance: ${context.attendancePercentage}%.` : ''}${context.consecutiveAbsences ? ` Consecutive absences: ${context.consecutiveAbsences}.` : ''}\n\n${action}\n\nRegards,\nMavericks Execution Platform`
      break
  }

  return {
    subject,
    html: htmlFromText(text),
    text,
    aiGenerated: false,
    aiProvider: 'fallback',
  }
}

function cleanContext(context) {
  return Object.fromEntries(
    SUPPORTED_CONTEXT_FIELDS
      .filter((key) => context[key] !== undefined && context[key] !== null && context[key] !== '')
      .map((key) => [key, context[key]]),
  )
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
}

async function requestOpenAiEmail(context, { apiKey, fetchImpl, model, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: 'Write a concise professional training email. Return only JSON matching the schema. Do not invent links, dates, scores, attendance, or names. Use supplied facts only.',
        input: JSON.stringify(cleanContext(context)),
        max_output_tokens: 500,
        text: {
          format: {
            type: 'json_schema',
            name: 'email_content',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}.`)
    }

    const data = await response.json()
    const parsed = JSON.parse(outputText(data))

    if (!parsed.subject || !parsed.html || !parsed.text) {
      throw new Error('OpenAI returned incomplete email content.')
    }

    return {
      subject: parsed.subject,
      html: parsed.html,
      text: parsed.text,
      aiGenerated: true,
      aiProvider: 'openai',
      aiModel: model,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateEmailContent(
  context = {},
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console,
    timeoutMs = 8000,
  } = {},
) {
  const fallback = createFallbackEmail(context)
  const enabled = String(env.AI_EMAIL_ENABLED ?? 'true').toLowerCase() !== 'false'
  const provider = String(env.AI_PROVIDER ?? 'openai').toLowerCase()
  const apiKey = env.OPENAI_API_KEY?.trim()
  const model = env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  if (!enabled) return { ...fallback, aiFallbackReason: 'disabled' }
  if (provider !== 'openai') {
    logger.warn(`AI email fallback used: unsupported provider "${provider}".`)
    return { ...fallback, aiFallbackReason: 'unsupported_provider' }
  }
  if (!apiKey) {
    if (env.NODE_ENV === 'production') {
      logger.warn('AI email fallback used: OPENAI_API_KEY is not configured.')
    }
    return { ...fallback, aiFallbackReason: 'missing_api_key' }
  }
  if (typeof fetchImpl !== 'function') {
    logger.warn('AI email fallback used: fetch is unavailable.')
    return { ...fallback, aiFallbackReason: 'fetch_unavailable' }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestOpenAiEmail(context, { apiKey, fetchImpl, model, timeoutMs })
    } catch (error) {
      if (attempt === 1) {
        logger.warn(`AI email fallback used: ${error instanceof Error ? error.message : 'OpenAI call failed.'}`)
      }
    }
  }

  return { ...fallback, aiFallbackReason: 'api_failed' }
}
