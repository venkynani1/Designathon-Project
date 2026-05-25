import jwt from 'jsonwebtoken'
import { config } from './config.js'

const defaultTokenTtl = '8h'

export function getJwtSecret() {
  return config.jwtSecret
}

export function signSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: defaultTokenTtl },
  )
}

export function requireAuth(request, response, next) {
  const header = request.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    response.status(401).json({ error: 'Authentication required.' })
    return
  }

  try {
    request.user = jwt.verify(token, getJwtSecret())
    next()
  } catch {
    response.status(401).json({ error: 'Invalid or expired token.' })
  }
}

export function requireRole(...roles) {
  const allowedRoles = new Set(roles)

  return (request, response, next) => {
    if (!request.user) {
      response.status(401).json({ error: 'Authentication required.' })
      return
    }

    if (!allowedRoles.has(request.user.role)) {
      response.status(403).json({ error: 'Insufficient role permission.' })
      return
    }

    next()
  }
}
