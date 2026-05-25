import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { coordinatorReadAccess } from '../access.js'
import { prisma } from '../db.js'

export const settingsRouter = Router()

const SETTINGS_KEY = 'admin-settings'
const canManageSettings = [requireAuth, requireRole('Admin')]

const defaultSettings = {
  attendanceGraceMinutes: 20,
  attendanceDeadlineTime: '10:00',
  assessmentCutoffDefault: 70,
  feedbackEnabled: true,
  reminderEmailEnabled: true,
  topperCalculationMode: 'First-attempt cleared participants only',
  topperCutoffThreshold: 70,
  excludeRetakeScores: true,
}

settingsRouter.get('/settings', coordinatorReadAccess, async (_request, response, next) => {
  try {
    const settings = await prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
    })

    const value = settings?.value ?? {}
    response.json({
      data: {
        ...defaultSettings,
        ...value,
        reminderEmailEnabled: value.reminderEmailEnabled ?? value.reminderMockEnabled ?? true,
      },
    })
  } catch (error) {
    next(error)
  }
})

settingsRouter.put('/settings', canManageSettings, async (request, response, next) => {
  try {
    const value = { ...defaultSettings, ...(request.body ?? {}) }
    delete value.reminderMockEnabled
    const settings = await prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value },
      create: { key: SETTINGS_KEY, value },
    })

    response.json({ data: { ...defaultSettings, ...(settings.value ?? {}) } })
  } catch (error) {
    next(error)
  }
})
