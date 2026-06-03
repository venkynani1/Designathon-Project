// Exposes authenticated HTTP endpoints for the users domain.
import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { normalizeRole, requireAuth, requireRole, roleVariants } from '../auth.js'
import { prisma } from '../db.js'

export const usersRouter = Router()

const canManageUsers = [requireAuth, requireRole('Admin')]
const manageableRoles = new Set(['Admin', 'Coordinator', 'Trainer'])
const manageableRoleVariants = [...manageableRoles].flatMap(roleVariants)

function toManageableRole(role) {
  const normalizedRole = normalizeRole(role)
  return manageableRoles.has(normalizedRole) ? normalizedRole : ''
}

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: toManageableRole(user.role) || user.role,
    status: user.status ?? 'Active',
  }
}

function validateUser(body) {
  if (!body?.name || !body?.email || !toManageableRole(body?.role)) {
    return 'Name, email, and a valid role are required.'
  }

  return null
}

usersRouter.get('/users', canManageUsers, async (_request, response, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: manageableRoleVariants } },
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
        role: toManageableRole(request.body.role),
        status: 'Active',
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

usersRouter.patch('/users/:userId/status', canManageUsers, async (request, response, next) => {
  try {
    const status = request.body?.status
    if (!['Active', 'Inactive'].includes(status)) {
      response.status(400).json({ error: 'Status must be Active or Inactive.' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { id: request.params.userId } })
    const existingRole = toManageableRole(existing?.role)

    if (!existing || !existingRole) {
      response.status(404).json({ error: 'User not found.' })
      return
    }

    if (status === 'Inactive' && existing.id === request.user.sub && existingRole === 'Admin') {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: { in: roleVariants('Admin') },
          status: 'Active',
          id: { not: existing.id },
        },
      })
      if (!otherActiveAdmins) {
        response.status(409).json({ error: 'Cannot deactivate the only active administrator.' })
        return
      }
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { status },
    })
    await prisma.log.create({
      data: {
        id: randomUUID(),
        batchId: null,
        batchCode: null,
        action: status === 'Inactive' ? 'user_deactivated' : 'user_reactivated',
        category: 'audit',
        channel: null,
        event: status === 'Inactive' ? 'user_deactivated' : 'user_reactivated',
        level: 'INFO',
        message: `${existingRole} user ${existing.email} was ${status === 'Inactive' ? 'deactivated' : 'reactivated'} by ${request.user.email}.`,
        recipient: existing.email,
        recipients: [existing.email],
        status: 'Completed',
        type: 'Access',
        createdAt: new Date(),
      },
    })

    response.json({ data: mapUser(user) })
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'User not found.' })
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
        role: toManageableRole(request.body.role),
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
