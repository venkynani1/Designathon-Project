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
  const databaseUrl = getRequiredEnv(env, 'DATABASE_URL')
  const jwtSecret = getRequiredEnv(env, 'JWT_SECRET')
  const corsOrigin = getRequiredEnv(env, 'CORS_ORIGIN') ?? 'http://localhost:5173'
  const port = parsePort(env.PORT)

  if (!databaseUrl) missing.push('DATABASE_URL')
  if (!jwtSecret) missing.push('JWT_SECRET')

  if (!port) {
    throw new ConfigError('Invalid backend environment configuration.', [
      'PORT must be an integer between 1 and 65535.',
    ])
  }

  if (missing.length) {
    throw new ConfigError('Missing required backend environment variables.', missing)
  }

  return Object.freeze({
    corsOrigin,
    databaseUrl,
    isDevelopment: (env.NODE_ENV ?? 'development') === 'development',
    jwtSecret,
    nodeEnv: env.NODE_ENV ?? 'development',
    port,
  })
}

export const config = loadConfig()
