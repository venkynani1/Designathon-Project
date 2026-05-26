// Provides core API infrastructure for requestLogger concerns.
import { config } from './config.js'

export function requestLogger(request, response, next) {
  if (!config.isDevelopment) {
    next()
    return
  }

  const startedAt = Date.now()

  response.on('finish', () => {
    const duration = Date.now() - startedAt
    console.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms`)
  })

  next()
}
