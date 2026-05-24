export async function sendEmail({ to = [], subject, body }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean)

  // TODO: Replace this mock with Azure Communication Services or SendGrid delivery.
  return {
    provider: 'mock',
    status: 'Mock Sent',
    to: recipients,
    subject,
    body,
    sentAt: new Date().toISOString(),
  }
}
