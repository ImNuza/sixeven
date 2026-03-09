import { verifyAuthToken } from '../services/authService.js'

/**
 * @param {{ getUserById, pool }} opts
 *   pool — needed for the token denylist check (revoked_tokens table)
 */
export function createAuthMiddleware({ getUserById, pool }) {
  return async function requireAuth(req, res, next) {
    // Prefer httpOnly cookie (XSS-safe); fall back to Authorization header
    const cookieToken = req.cookies?.ss_auth || ''
    const header = req.headers.authorization || ''
    const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : ''
    const token = cookieToken || bearerToken

    const parsed = verifyAuthToken(token)
    if (!parsed) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    // Check token denylist — catches revoked tokens (logout, password change)
    if (parsed.jti && pool) {
      try {
        const { rows } = await pool.query(
          'SELECT 1 FROM revoked_tokens WHERE jti = $1',
          [parsed.jti]
        )
        if (rows.length) {
          return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' })
        }
      } catch (err) {
        console.error('[auth] Denylist check failed:', err.message)
        // Fail open (don't block requests if DB is momentarily unavailable)
      }
    }

    const user = await getUserById(parsed.id)
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' })
    }

    req.user = user
    req.tokenMeta = { jti: parsed.jti, exp: parsed.exp }
    return next()
  }
}
