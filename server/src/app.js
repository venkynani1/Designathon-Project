import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler, normalizeErrorResponses, notFoundHandler } from './http.js'
import { requestLogger } from './requestLogger.js'
import { assessmentsRouter } from './routes/assessments.js'
import { attendanceRouter } from './routes/attendance.js'
import { authRouter } from './routes/auth.js'
import { batchesRouter } from './routes/batches.js'
import { feedbackRouter } from './routes/feedback.js'
import { healthRouter } from './routes/health.js'
import { insightsRouter } from './routes/insights.js'
import { logsRouter } from './routes/logs.js'
import { notificationsRouter } from './routes/notifications.js'
import { placementOfficersRouter } from './routes/placementOfficers.js'
import { reportsRouter } from './routes/reports.js'
import { settingsRouter } from './routes/settings.js'
import { trainerProfilesRouter } from './routes/trainerProfiles.js'

export function createApp() {
  const app = express()

  app.use(requestLogger)
  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))
  app.use(normalizeErrorResponses)

  app.use('/api', healthRouter)
  app.use('/api', authRouter)
  app.use('/api', batchesRouter)
  app.use('/api', assessmentsRouter)
  app.use('/api', attendanceRouter)
  app.use('/api', feedbackRouter)
  app.use('/api', logsRouter)
  app.use('/api', notificationsRouter)
  app.use('/api', settingsRouter)
  app.use('/api', trainerProfilesRouter)
  app.use('/api', placementOfficersRouter)
  app.use('/api', insightsRouter)
  app.use('/api', reportsRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
