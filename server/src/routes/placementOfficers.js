import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { prisma } from '../db.js'

export const placementOfficersRouter = Router()

const canManageMappings = [requireAuth, requireRole('Admin', 'Coordinator')]

function mapPlacementOfficerMapping(mapping) {
  return {
    id: mapping.id,
    collegeName: mapping.collegeName,
    placementOfficerEmail: mapping.placementOfficerEmail,
  }
}

placementOfficersRouter.get('/placement-officer-mappings', async (_request, response, next) => {
  try {
    const mappings = await prisma.placementOfficerMapping.findMany({
      orderBy: { collegeName: 'asc' },
    })

    response.json({ data: mappings.map(mapPlacementOfficerMapping) })
  } catch (error) {
    next(error)
  }
})

placementOfficersRouter.put('/placement-officer-mappings/:collegeName', canManageMappings, async (request, response, next) => {
  try {
    if (!request.body?.placementOfficerEmail) {
      response.status(400).json({ error: 'Placement officer email is required.' })
      return
    }

    const mapping = await prisma.placementOfficerMapping.upsert({
      where: { collegeName: request.params.collegeName },
      update: { placementOfficerEmail: request.body.placementOfficerEmail },
      create: {
        collegeName: request.params.collegeName,
        placementOfficerEmail: request.body.placementOfficerEmail,
      },
    })

    response.json({ data: mapPlacementOfficerMapping(mapping) })
  } catch (error) {
    next(error)
  }
})
