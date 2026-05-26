import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'

export const usersRouter = Router()

const canManageUsers = [requireAuth, requireRole('Admin')]
const manageableRoles = new Set(['Admin', 'Coordinator', 'Trainer'])

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: 'Active',
  }
}

function validateUser(body) {
  if (!body?.name || !body?.email || !manageableRoles.has(body?.role)) {
    return 'Name, email, and a valid role are required.'
  }

  return null
}

usersRouter.get('/users', canManageUsers, async (_request, response, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: [...manageableRoles] } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })

    response.json({ data: users.map(mapUser) })
  } catch (error) {
    next(error)
  }
})

usersRouter.post('/users', canManageUsers, async (request, response, next) => {
  try {
    const validationError = validateUser(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const user = await prisma.user.create({
      data: {
        name: request.body.name,
        email: request.body.email,
        role: request.body.role,
      },
    })

    response.status(201).json({ data: mapUser(user) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'A user with this email already exists.' })
      return
    }

    next(error)
  }
})

usersRouter.put('/users/:userId', canManageUsers, async (request, response, next) => {
  try {
    const validationError = validateUser(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const user = await prisma.user.update({
      where: { id: request.params.userId },
      data: {
        name: request.body.name,
        email: request.body.email,
        role: request.body.role,
      },
    })

    response.json({ data: mapUser(user) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'A user with this email already exists.' })
      return
    }
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'User not found.' })
      return
    }

    next(error)
  }
})
