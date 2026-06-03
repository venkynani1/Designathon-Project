// Provides core API infrastructure for auth concerns.
import jwt from 'jsonwebtoken'
import { config } from './config.js'

const defaultTokenTtl = '8h'
const canonicalRoles = new Map([
  ['admin', 'Admin'],
  ['coordinator', 'Coordinator'],
  ['trainer', 'Trainer'],
  ['participant', 'Participant'],
])

export function normalizeRole(role) {
  const key = String(role ?? '').trim().toLowerCase()
  return canonicalRoles.get(key) ?? ''
}

export function roleVariants(role) {
  const canonicalRole = normalizeRole(role)
  if (!canonicalRole) return []

  return [...new Set([canonicalRole, canonicalRole.toUpperCase(), canonicalRole.toLowerCase()])]
}

export function getJwtSecret() {
  return config.jwtSecret
}

export function signSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: normalizeRole(user.role) || user.role,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: defaultTokenTtl },
  )
}

export async function requireAuth(request, response, next) {
  const header = request.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    response.status(401).json({ error: 'Authentication required.' })
    return
  }

  try {
    const tokenUser = jwt.verify(token, getJwtSecret())
    const { prisma } = await import('./db.js')
    const currentUser = await prisma.user.findUnique({ where: { id: tokenUser.sub } })

    if (!currentUser || currentUser.status === 'Inactive') {
      response.status(403).json({ error: 'Account is inactive or unavailable.' })
      return
    }

    request.user = {
      ...tokenUser,
      role: normalizeRole(currentUser.role) || currentUser.role,
      name: currentUser.name,
      email: currentUser.email,
    }
    next()
  } catch {
    response.status(401).json({ error: 'Invalid or expired token.' })
  }
}

export function requireRole(...roles) {
  const allowedRoles = new Set(roles.map(normalizeRole))

  return (request, response, next) => {
    if (!request.user) {
      response.status(401).json({ error: 'Authentication required.' })
      return
    }

    if (!allowedRoles.has(normalizeRole(request.user.role))) {
      response.status(403).json({ error: 'Insufficient role permission.' })
      return
    }

    next()
  }
}
