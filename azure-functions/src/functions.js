import { app } from '@azure/functions'
import { callSchedulerEndpoint } from './backendClient.js'

const jobs = [
  {
    name: 'attendanceCutoffReminder',
    schedule: '0 */5 * * * *',
    endpoint: '/api/notifications/run/attendance-cutoff',
  },
  {
    name: 'consecutiveAbsenceReminder',
    schedule: '0 30 12 * * *',
    endpoint: '/api/notifications/run/consecutive-absence',
  },
  {
    name: 'onboardingReminder',
    schedule: '0 30 3 * * *',
    endpoint: '/api/notifications/run/onboarding',
  },
  {
    name: 'assessmentReminder',
    schedule: '0 30 2 * * *',
    endpoint: '/api/notifications/run/assessment-reminders',
  },
]

jobs.forEach((job) => {
  app.timer(job.name, {
    schedule: job.schedule,
    handler: async (_timer, context) => {
      context.log(`Starting ${job.name}`)

      try {
        const summary = await callSchedulerEndpoint(job.endpoint, {
          log: {
            info: (message, data) => context.log(message, data),
            error: (message) => context.error(message),
          },
        })

        context.log(`${job.name} completed`, summary)
      } catch (error) {
        context.error(
          `${job.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        throw error
      }
    },
  })
})
