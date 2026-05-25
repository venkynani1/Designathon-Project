import { requireAuth, requireRole } from './auth.js'

export const staffReadAccess = [
  requireAuth,
  requireRole('Admin', 'Coordinator', 'Trainer'),
]

export const coordinatorReadAccess = [
  requireAuth,
  requireRole('Admin', 'Coordinator'),
]
