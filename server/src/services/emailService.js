import { EmailClient } from '@azure/communication-email'
import { enqueueEmailDelivery } from '../utils/emailQueue.js'

export const VERIFIED_AZURE_EMAIL_SENDER =
  'DoNotReply@87c3b3a6-ea7f-4758-a4e2-b1d2aaf25472.azurecomm.net'

const TEMPORARY_REJECTION_MESSAGE =
  'Azure Email temporarily rejected the request. Please retry after a few minutes.'

function normalizeRecipients(value) {
  const recipients = Array.isArray(value) ? value : [value]

  return recipients
    .map((recipient) => String(recipient ?? '').trim())
    .filter(Boolean)
}

function baseResult({ cc, metadata, subject, text, to }) {
  return {
    messageId: '',
    recipients: to,
    cc,
    subject,
    text,
    metadata: metadata ?? {},
    providerStatusCode: null,
    providerCode: '',
    providerMessage: '',
    retryAfterSeconds: null,
    requestId: '',
    attemptNumber: 0,
    retryCount: 0,
    queueWaitTimeMs: 0,
    deliveryState: 'queued',
  }
}

function createMockResult(options) {
  return {
    ...baseResult(options),
    provider: 'mock',
    status: 'Mock Sent',
    deliveryState: 'sent',
    error: '',
  }
}

function getHeader(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name)
  return headers[name] ?? headers[name.toLowerCase()]
}

function toRetryAfterSeconds(value) {
  if (value === undefined || value === null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null
}

function redactMessage(value, connectionString) {
  let message = String(value ?? '').replace(/accesskey=[^;\s]+/gi, 'accesskey=[REDACTED]')
  if (connectionString) {
    message = message.replaceAll(connectionString, '[REDACTED_CONNECTION_STRING]')
  }
  return message
}

function extractAzureError(error, connectionString) {
  const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status ?? null
  const code = String(error?.code ?? error?.details?.error?.code ?? error?.response?.body?.error?.code ?? '')
  const name = String(error?.name ?? 'AzureEmailError')
  const rawMessage = redactMessage(
    error?.message ?? error?.details?.error?.message ?? error?.response?.body?.error?.message ?? 'Azure email send failed.',
    connectionString,
  )
  const retryAfterSeconds = toRetryAfterSeconds(
    error?.retryAfterSeconds ??
      error?.retryAfter ??
      getHeader(error?.response?.headers, 'retry-after') ??
      getHeader(error?.headers, 'retry-after'),
  )
  const requestId = String(
    error?.requestId ??
      error?.details?.requestId ??
      getHeader(error?.response?.headers, 'x-ms-request-id') ??
      getHeader(error?.headers, 'x-ms-request-id') ??
      '',
  )
  const hasEmptyRetry =
    (statusCode === 429 && (retryAfterSeconds === null || retryAfterSeconds === 0)) ||
    /try again after 0 seconds/i.test(rawMessage)
  const providerMessage = hasEmptyRetry ? TEMPORARY_REJECTION_MESSAGE : rawMessage

  return {
    providerStatusCode: statusCode,
    providerCode: code,
    providerName: name,
    providerMessage,
    retryAfterSeconds,
    requestId,
  }
}

function createAzureFailure(options, diagnostics, deliveryState = 'failed') {
  return {
    ...baseResult(options),
    provider: 'azure',
    status: 'Failed',
    deliveryState,
    error: diagnostics.providerMessage,
    ...diagnostics,
  }
}

function configurationFailure(options, providerMessage, providerCode) {
  const diagnostics = {
    providerStatusCode: null,
    providerCode,
    providerName: 'AzureEmailConfigurationError',
    providerMessage,
    retryAfterSeconds: null,
    requestId: '',
  }
  logSafeAzureFailure(diagnostics)
  return createAzureFailure(options, diagnostics, 'failed')
}

function logSafeAzureFailure(diagnostics) {
  console.error('Azure Email send failed.', {
    statusCode: diagnostics.providerStatusCode,
    code: diagnostics.providerCode,
    name: diagnostics.providerName,
    message: diagnostics.providerMessage,
    retryAfter: diagnostics.retryAfterSeconds,
    requestId: diagnostics.requestId,
    attemptNumber: diagnostics.attemptNumber ?? 0,
    retryCount: diagnostics.retryCount ?? 0,
    queueWaitTimeMs: diagnostics.queueWaitTimeMs ?? 0,
  })
}

function retryDelaysMs() {
  const configured = String(process.env.AZURE_EMAIL_RETRY_DELAYS_MS ?? '')
    .split(',')
    .map((delay) => delay.trim())
    .filter(Boolean)
    .map((delay) => Number(delay))
    .filter((delay) => Number.isFinite(delay) && delay >= 0)
  return configured.length ? configured.slice(0, 3) : [2000, 5000, 10000]
}

function isTransientAzureFailure(diagnostics) {
  const statusCode = Number(diagnostics.providerStatusCode)
  const code = String(diagnostics.providerCode ?? '').toLowerCase()
  const name = String(diagnostics.providerName ?? '').toLowerCase()
  return statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500 ||
    ['toomanyrequests', 'throttled', 'timeout', 'requesttimeout', 'serviceunavailable', 'serverbusy', 'etimedout', 'econnreset']
      .some((value) => code.includes(value) || name.includes(value))
}

function retryDelayMs(diagnostics, fallbackDelayMs) {
  const azureDelayMs = Number(diagnostics.retryAfterSeconds) * 1000
  return Number.isFinite(azureDelayMs) && azureDelayMs > 0
    ? Math.max(azureDelayMs, fallbackDelayMs)
    : fallbackDelayMs
}

function wait(milliseconds) {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve()
}

export async function sendEmail({
  to = [],
  cc = [],
  subject,
  html,
  text,
  metadata,
  requireAzure = false,
} = {}) {
  const recipients = normalizeRecipients(to)
  const ccRecipients = normalizeRecipients(cc)
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING?.trim()
  const senderAddress = process.env.AZURE_EMAIL_FROM_ADDRESS?.trim()
  const plainText = text ?? ''
  const htmlBody = html ?? (plainText ? `<p>${plainText}</p>` : '')
  const options = {
    cc: ccRecipients,
    metadata,
    subject,
    text: plainText,
    to: recipients,
  }

  if (!connectionString && !senderAddress && !requireAzure) {
    return createMockResult(options)
  }

  if (!connectionString) {
    return configurationFailure(
      options,
      'AZURE_COMMUNICATION_CONNECTION_STRING is required for Azure Email delivery.',
      'MissingConnectionString',
    )
  }
  if (!connectionString.toLowerCase().startsWith('endpoint=https://')) {
    return configurationFailure(
      options,
      'AZURE_COMMUNICATION_CONNECTION_STRING must start with endpoint=https://.',
      'InvalidConnectionString',
    )
  }
  if (!senderAddress) {
    return configurationFailure(
      options,
      'AZURE_EMAIL_FROM_ADDRESS is required for Azure Email delivery.',
      'MissingSenderAddress',
    )
  }
  if (senderAddress !== VERIFIED_AZURE_EMAIL_SENDER) {
    return configurationFailure(
      options,
      `AZURE_EMAIL_FROM_ADDRESS must exactly match the verified sender: ${VERIFIED_AZURE_EMAIL_SENDER}.`,
      'InvalidSenderAddress',
    )
  }

  const message = {
    senderAddress,
    recipients: {
      to: recipients.map((address) => ({ address })),
      ...(ccRecipients.length
        ? { cc: ccRecipients.map((address) => ({ address })) }
        : {}),
    },
    content: {
      subject,
      html: htmlBody,
      plainText,
    },
  }

  return enqueueEmailDelivery(async ({ queueWaitTimeMs }) => {
    const client = new EmailClient(connectionString)
    const delays = retryDelaysMs()
    let lastDiagnostics = null

    for (let attemptIndex = 0; attemptIndex <= delays.length; attemptIndex += 1) {
      const attemptNumber = attemptIndex + 1
      try {
        const poller = await client.beginSend(message)
        const result = await poller.pollUntilDone()
        const completionStatus = String(result?.status ?? '').toLowerCase()
        if (completionStatus && !['succeeded', 'success', 'sent', 'completed'].includes(completionStatus)) {
          throw {
            ...result?.error,
            code: result?.error?.code ?? result?.status,
            message: result?.error?.message ?? `Azure Email delivery completed with status ${result?.status}.`,
          }
        }

        return {
          ...baseResult(options),
          provider: 'azure',
          status: 'Sent',
          deliveryState: 'sent',
          messageId: result?.id ?? result?.messageId ?? '',
          attemptNumber,
          retryCount: attemptIndex,
          queueWaitTimeMs,
          error: '',
        }
      } catch (error) {
        lastDiagnostics = extractAzureError(error, connectionString)
        const transient = isTransientAzureFailure(lastDiagnostics)
        const shouldRetry = transient && attemptIndex < delays.length
        logSafeAzureFailure({
          ...lastDiagnostics,
          attemptNumber,
          retryCount: attemptIndex,
          queueWaitTimeMs,
        })
        if (!shouldRetry) {
          return {
            ...createAzureFailure(
              options,
              lastDiagnostics,
              transient ? 'temporarily_unavailable' : 'failed',
            ),
            attemptNumber,
            retryCount: attemptIndex,
            queueWaitTimeMs,
          }
        }
        const delayMs = retryDelayMs(lastDiagnostics, delays[attemptIndex])
        console.warn('Azure Email delivery retry scheduled.', {
          statusCode: lastDiagnostics.providerStatusCode,
          code: lastDiagnostics.providerCode,
          requestId: lastDiagnostics.requestId,
          attemptNumber,
          retryCount: attemptIndex + 1,
          delayMs,
          queueWaitTimeMs,
        })
        await wait(delayMs)
      }
    }

    return createAzureFailure(options, lastDiagnostics ?? {}, 'failed')
  })
}
