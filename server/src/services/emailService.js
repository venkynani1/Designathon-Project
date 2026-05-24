import { EmailClient } from '@azure/communication-email'

function normalizeRecipients(value) {
  const recipients = Array.isArray(value) ? value : [value]

  return recipients
    .map((recipient) => String(recipient ?? '').trim())
    .filter(Boolean)
}

function createMockResult({ cc, metadata, subject, text, to }) {
  return {
    provider: 'mock',
    status: 'Mock Sent',
    messageId: '',
    recipients: to,
    cc,
    subject,
    text,
    metadata: metadata ?? {},
    error: '',
  }
}

export async function sendEmail({
  to = [],
  cc = [],
  subject,
  html,
  text,
  metadata,
} = {}) {
  const recipients = normalizeRecipients(to)
  const ccRecipients = normalizeRecipients(cc)
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
  const senderAddress = process.env.AZURE_EMAIL_FROM_ADDRESS
  const plainText = text ?? ''
  const htmlBody = html ?? (plainText ? `<p>${plainText}</p>` : '')

  if (!connectionString || !senderAddress) {
    return createMockResult({
      cc: ccRecipients,
      metadata,
      subject,
      text: plainText,
      to: recipients,
    })
  }

  try {
    const client = new EmailClient(connectionString)
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
    const poller = await client.beginSend(message)
    const result = await poller.pollUntilDone()

    return {
      provider: 'azure',
      status: 'Sent',
      messageId: result?.id ?? result?.messageId ?? '',
      recipients,
      cc: ccRecipients,
      subject,
      text: plainText,
      metadata: metadata ?? {},
      error: '',
    }
  } catch (error) {
    return {
      provider: 'azure',
      status: 'Failed',
      messageId: '',
      recipients,
      cc: ccRecipients,
      subject,
      text: plainText,
      metadata: metadata ?? {},
      error: error instanceof Error ? error.message : 'Azure email send failed.',
    }
  }
}
