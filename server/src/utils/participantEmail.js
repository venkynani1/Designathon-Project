export function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

export function resolveParticipantEmail(participant = {}) {
  return [
    participant.email,
    participant.empEmail,
    participant.officialEmail,
    participant.participantEmail,
  ]
    .map((email) => String(email ?? '').trim())
    .find(hasValidEmail) ?? ''
}

export function resolvePlacementOfficerEmail(participant = {}) {
  const email = String(participant.placementOfficerEmail ?? '').trim()
  return hasValidEmail(email) ? email : ''
}
