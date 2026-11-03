import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { HttpError } from './lib/http'

const SECRET = process.env.JWT_SECRET ?? 'dev-only-secret'

export interface AuthUser {
  id: string
  role: Role
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign({ role: user.role }, SECRET, { subject: user.id, expiresIn: '7d' })
}

/** The user a token belongs to, or null if it's missing, forged or expired. */
export function verifyToken(token: unknown): AuthUser | null {
  if (typeof token !== 'string' || !token) return null
  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload
    return { id: payload.sub!, role: payload.role }
  } catch {
    return null
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'Not signed in')
  const user = verifyToken(token)
  if (!user) throw new HttpError(401, 'Session expired, please sign in again')
  req.user = user
  next()
}

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) throw new HttpError(403, 'Not allowed')
    next()
  }
}

/** The signed-in user. Only valid on routes behind requireAuth. */
export function currentUser(req: Express.Request): AuthUser {
  return req.user!
}
