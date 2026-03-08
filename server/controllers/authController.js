import { TOKEN_TTL_MS } from '../services/authService.js'
import { auditLog } from '../services/auditService.js'

const COOKIE_NAME = 'ss_auth'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  sameSite: 'strict',
  path: '/',
  maxAge: TOKEN_TTL_MS,
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS)
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', path: '/' })
}

export function createAuthController({
  pool,
  createUserAccount,
  authenticateAccount,
  getUserById,
  changePassword,
  deleteAccount,
  updateProfile,
}) {
  return {
    register: async (req, res) => {
      try {
        const session = await createUserAccount(req.body)
        setAuthCookie(res, session.token)
        await auditLog(pool, { userId: session.user.id, action: 'register', req })
        res.status(201).json(session)
      } catch (error) {
        await auditLog(pool, { action: 'register_failed', req, meta: { username: req.body?.username, reason: error.message } })
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    login: async (req, res) => {
      try {
        const session = await authenticateAccount(req.body)
        setAuthCookie(res, session.token)
        await auditLog(pool, { userId: session.user.id, action: 'login', req })
        res.json(session)
      } catch (error) {
        await auditLog(pool, { action: 'login_failed', req, meta: { username: req.body?.username, reason: error.message } })
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    logout: async (req, res) => {
      try {
        const { jti, exp } = req.tokenMeta || {}
        if (jti && exp) {
          // Add token to denylist until its natural expiry
          await pool.query(
            `INSERT INTO revoked_tokens (jti, user_id, expires_at)
             VALUES ($1, $2, to_timestamp($3 / 1000.0))
             ON CONFLICT (jti) DO NOTHING`,
            [jti, req.user.id, exp]
          )
        }
        clearAuthCookie(res)
        await auditLog(pool, { userId: req.user.id, action: 'logout', req })
        res.status(204).end()
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    },

    me: async (req, res) => {
      try {
        const user = await getUserById(req.user.id)
        res.json({ user })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    },

    updatePassword: async (req, res) => {
      try {
        const session = await changePassword(req.user.id, req.body)
        // Revoke the old token
        const { jti, exp } = req.tokenMeta || {}
        if (jti && exp) {
          await pool.query(
            `INSERT INTO revoked_tokens (jti, user_id, expires_at)
             VALUES ($1, $2, to_timestamp($3 / 1000.0))
             ON CONFLICT (jti) DO NOTHING`,
            [jti, req.user.id, exp]
          )
        }
        // Issue fresh cookie with new token
        setAuthCookie(res, session.token)
        await auditLog(pool, { userId: req.user.id, action: 'password_change', req })
        res.json(session)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    updateProfile: async (req, res) => {
      try {
        const result = await updateProfile(req.user.id, req.body)
        res.json(result)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    removeAccount: async (req, res) => {
      try {
        const result = await deleteAccount(req.user.id, req.body)
        clearAuthCookie(res)
        await auditLog(pool, { userId: req.user.id, action: 'account_deleted', req })
        res.json(result)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },
  }
}
