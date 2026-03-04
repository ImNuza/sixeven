import { verifyAuthToken } from '../services/authService.js'

export function createAuthMiddleware({ getUserById }) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const parsed = verifyAuthToken(token)

    if (!parsed) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    const user = await getUserById(parsed.id)
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' })
    }

    req.user = user
    return next()
  }
}
