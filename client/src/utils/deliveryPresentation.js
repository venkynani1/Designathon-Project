// Implements client-side deliveryPresentation workflow and data-processing behavior.
const presentations = {
  queued: {
    label: 'Queued',
    message: 'Delivery queued.',
    classes: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  sending: {
    label: 'Sending',
    message: 'Sending email.',
    classes: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  retrying: {
    label: 'Retrying',
    message: 'Retrying delivery...',
    classes: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  sent: {
    label: 'Sent',
    message: 'Email sent successfully.',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  temporarily_unavailable: {
    label: 'Temporarily unavailable',
    message: 'Temporarily unavailable. Please try again later.',
    classes: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  failed: {
    label: 'Failed',
    message: 'Delivery failed. Try again later.',
    classes: 'border-rose-200 bg-rose-50 text-rose-700',
  },
}

export function resolveDeliveryState(delivery = {}) {
  const state = String(delivery.deliveryState ?? '').toLowerCase()
  if (presentations[state]) return state
  if (Number(delivery.providerStatusCode) === 429 || String(delivery.providerCode).toLowerCase() === 'toomanyrequests') {
    return 'temporarily_unavailable'
  }
  if (['Sent', 'Mock Sent'].includes(delivery.status)) return 'sent'
  if (delivery.status === 'Failed') return 'failed'
  return 'failed'
}

export function deliveryPresentation(delivery = {}) {
  return presentations[resolveDeliveryState(delivery)]
}
