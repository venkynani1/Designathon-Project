import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { coordinatorReadAccess } from '../access.js'
import { prisma } from '../db.js'
import { mapTrainerProfile } from '../mappers.js'

export const trainerProfilesRouter = Router()

const canManageTrainerProfiles = [requireAuth, requireRole('Admin', 'Coordinator')]

function getTrainerProfileData(body) {
  return {
    id: body.id ?? `TRN-${Date.now().toString().slice(-6)}`,
    name: body.name,
    email: body.email,
    empId: body.empId ?? '',
    unitOrCompetency: body.unitOrCompetency ?? '',
    phone: body.phone ?? '',
    specialization: body.specialization ?? '',
    status: body.status ?? 'Active',
  }
}

function validateTrainerProfile(body) {
  if (!body?.name || !body?.email) {
    return 'Trainer name and email are required.'
  }

  return null
}

trainerProfilesRouter.get('/trainer-profiles', coordinatorReadAccess, async (_request, response, next) => {
  try {
    const trainers = await prisma.trainerProfile.findMany({
      orderBy: { name: 'asc' },
    })

    response.json({ data: trainers.map(mapTrainerProfile) })
  } catch (error) {
    next(error)
  }
})

trainerProfilesRouter.post('/trainer-profiles', canManageTrainerProfiles, async (request, response, next) => {
  try {
    const validationError = validateTrainerProfile(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const trainer = await prisma.trainerProfile.create({
      data: getTrainerProfileData(request.body),
    })

    response.status(201).json({ data: mapTrainerProfile(trainer) })
  } catch (error) {
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'Trainer profile already exists.' })
      return
    }

    next(error)
  }
})

trainerProfilesRouter.put('/trainer-profiles', canManageTrainerProfiles, async (request, response, next) => {
  try {
    if (!Array.isArray(request.body?.trainers)) {
      response.status(400).json({ error: 'trainers must be an array.' })
      return
    }

    const saved = []
    for (const trainer of request.body.trainers) {
      const validationError = validateTrainerProfile(trainer)

      if (validationError) {
        response.status(400).json({ error: validationError })
        return
      }

      const data = getTrainerProfileData(trainer)
      saved.push(
        await prisma.trainerProfile.upsert({
          where: { id: data.id },
          update: {
            name: data.name,
            email: data.email,
            empId: data.empId,
            unitOrCompetency: data.unitOrCompetency,
            phone: data.phone,
            specialization: data.specialization,
            status: data.status,
          },
          create: data,
        }),
      )
    }

    response.json({ data: saved.map(mapTrainerProfile) })
  } catch (error) {
    next(error)
  }
})

trainerProfilesRouter.put('/trainer-profiles/:trainerId', canManageTrainerProfiles, async (request, response, next) => {
  try {
    const validationError = validateTrainerProfile(request.body)

    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const data = getTrainerProfileData({ ...request.body, id: request.params.trainerId })
    delete data.id

    const trainer = await prisma.trainerProfile.update({
      where: { id: request.params.trainerId },
      data,
    })

    response.json({ data: mapTrainerProfile(trainer) })
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Trainer profile not found.' })
      return
    }

    next(error)
  }
})

trainerProfilesRouter.delete('/trainer-profiles/:trainerId', canManageTrainerProfiles, async (request, response, next) => {
  try {
    await prisma.trainerProfile.update({
      where: { id: request.params.trainerId },
      data: { status: 'Inactive' },
    })

    response.status(204).send()
  } catch (error) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Trainer profile not found.' })
      return
    }

    next(error)
  }
})
