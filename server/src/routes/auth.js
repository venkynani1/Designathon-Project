import { Router } from 'express'
import { requireAuth, signSessionToken } from '../auth.js'
import { prisma } from '../db.js'

export const authRouter = Router()

const roleByKey = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  trainer: 'Trainer',
}
const demoRoles = new Set(Object.values(roleByKey))

function toAuthUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status ?? 'Active',
  }
}

authRouter.get('/auth/config', (_request, response) => {
  response.json({
    data: {
      demoAuthEnabled: process.env.ENABLE_DEMO_AUTH === 'true',
    },
  })
})

authRouter.post('/auth/demo-login', async (request, response, next) => {
  try {
    if (process.env.ENABLE_DEMO_AUTH !== 'true') {
      response.status(404).json({ error: 'Authentication endpoint is not enabled.' })
      return
    }

    const requestedRole = request.body?.role
    const requestedEmail = request.body?.email
    const role =
      roleByKey[String(requestedRole ?? '').toLowerCase()] ?? requestedRole

    if (!demoRoles.has(role)) {
      response.status(404).json({ error: 'Demo role not available.' })
      return
    }

    const user = await prisma.user.findFirst({
      where: requestedEmail ? { email: requestedEmail, role } : { role },
    })

    if (!user || user.status === 'Inactive' || !demoRoles.has(user.role)) {
      response.status(404).json({ error: 'User not found.' })
      return
    }

    response.json({
      data: {
        token: signSessionToken(user),
        user: toAuthUser(user),
      },
    })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/auth/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
    })

    if (!user || user.status === 'Inactive') {
      response.status(404).json({ error: 'User not found.' })
      return
    }

    response.json({ data: toAuthUser(user) })
  } catch (error) {
    next(error)
  }
})
