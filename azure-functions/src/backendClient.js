// Calls protected backend scheduler endpoints from Azure Functions.
const schedulerHeaderName = 'x-scheduler-secret'

export function normalizeApiBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

export function buildSchedulerUrl(apiBaseUrl, endpoint) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const normalizedEndpoint = String(endpoint ?? '').startsWith('/')
    ? endpoint
    : `/${endpoint}`

  return `${baseUrl}${normalizedEndpoint}`
}

export function getSchedulerConfig(env = process.env) {
  return {
    apiBaseUrl: normalizeApiBaseUrl(env.API_BASE_URL),
    schedulerSecret: env.SCHEDULER_SECRET,
  }
}

export async function callSchedulerEndpoint(endpoint, { fetchImpl = fetch, log = console } = {}) {
  const { apiBaseUrl, schedulerSecret } = getSchedulerConfig()

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is required.')
  }

  if (!schedulerSecret) {
    throw new Error('SCHEDULER_SECRET is required.')
  }

  const url = buildSchedulerUrl(apiBaseUrl, endpoint)
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [schedulerHeaderName]: schedulerSecret,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = payload.error ?? `Scheduler endpoint failed with HTTP ${response.status}.`
    log.error?.(`Scheduler endpoint failed: ${endpoint} (${response.status})`)
    throw new Error(message)
  }

  log.info?.(`Scheduler endpoint completed: ${endpoint}`, payload.data ?? payload)
  return payload.data ?? payload
}
