import cors from 'cors'
import express from 'express'
import { assessmentsRouter } from './routes/assessments.js'
import { attendanceRouter } from './routes/attendance.js'
import { batchesRouter } from './routes/batches.js'
import { feedbackRouter } from './routes/feedback.js'
import { healthRouter } from './routes/health.js'
import { insightsRouter } from './routes/insights.js'
import { logsRouter } from './routes/logs.js'
import { reportsRouter } from './routes/reports.js'

export function createApp() {
  const app = express()
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'

  app.use(cors({ origin: corsOrigin }))
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', healthRouter)
  app.use('/api', batchesRouter)
  app.use('/api', assessmentsRouter)
  app.use('/api', attendanceRouter)
  app.use('/api', feedbackRouter)
  app.use('/api', logsRouter)
  app.use('/api', insightsRouter)
  app.use('/api', reportsRouter)

  app.use((_request, response) => {
    response.status(404).json({ error: 'Route not found.' })
  })

  app.use((error, _request, response, _next) => {
    console.error(error)
    response.status(500).json({ error: 'Internal server error.' })
  })

  return app
}
