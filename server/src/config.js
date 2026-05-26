// Provides core API infrastructure for config concerns.
export class ConfigError extends Error {
  constructor(message, details = []) {
    super(message)
    this.name = 'ConfigError'
    this.details = details
  }
}

function getRequiredEnv(env, name) {
  const value = env[name]?.trim()
  return value || null
}

function parsePort(value) {
  const port = Number(value ?? 4000)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  return port
}

export function loadConfig(env = process.env) {
  const missing = []
  const productionMissing = []
  const databaseUrl = getRequiredEnv(env, 'DATABASE_URL')
  const jwtSecret = getRequiredEnv(env, 'JWT_SECRET')
  const azureCommunicationConnectionString = getRequiredEnv(env, 'AZURE_COMMUNICATION_CONNECTION_STRING')
  const azureEmailFromAddress = getRequiredEnv(env, 'AZURE_EMAIL_FROM_ADDRESS')
  const schedulerSecret = getRequiredEnv(env, 'SCHEDULER_SECRET')
  const corsOrigin = getRequiredEnv(env, 'CORS_ORIGIN') ?? 'http://localhost:5173'
  const nodeEnv = env.NODE_ENV ?? 'development'
  const port = parsePort(env.PORT)

  if (!databaseUrl) missing.push('DATABASE_URL')
  if (!jwtSecret) missing.push('JWT_SECRET')
  if (nodeEnv === 'production') {
    if (!azureCommunicationConnectionString) productionMissing.push('AZURE_COMMUNICATION_CONNECTION_STRING')
    if (!azureEmailFromAddress) productionMissing.push('AZURE_EMAIL_FROM_ADDRESS')
    if (!schedulerSecret) productionMissing.push('SCHEDULER_SECRET')
  }

  if (!port) {
    throw new ConfigError('Invalid backend environment configuration.', [
      'PORT must be an integer between 1 and 65535.',
    ])
  }

  if (missing.length || productionMissing.length) {
    throw new ConfigError('Missing required backend environment variables.', [
      ...missing,
      ...productionMissing,
    ])
  }

  return Object.freeze({
    azureCommunicationConnectionString,
    azureEmailFromAddress,
    corsOrigin,
    databaseUrl,
    emailProvider:
      azureCommunicationConnectionString && azureEmailFromAddress ? 'azure' : 'mock',
    isDevelopment: nodeEnv === 'development',
    jwtSecret,
    nodeEnv,
    port,
    schedulerConfigured: Boolean(schedulerSecret),
    schedulerSecret,
  })
}

export const config = loadConfig()
