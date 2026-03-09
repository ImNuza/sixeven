/**
 * Audit logging service
 *
 * Writes an immutable record to audit_log for every sensitive operation:
 * login, register, logout, password change, account deletion.
 *
 * Failures are logged to stderr but never throw — audit logging must not
 * break the primary request path.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {{ userId?: number, action: string, req?: import('express').Request, meta?: object }} opts
 */
export async function auditLog(pool, { userId, action, req, meta } = {}) {
  try {
    const ip = req
      ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null)
      : null
    const userAgent = req?.headers?.['user-agent'] || null

    await pool.query(
      `INSERT INTO audit_log (user_id, action, ip, user_agent, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId ?? null, action, ip, userAgent, meta ? JSON.stringify(meta) : null]
    )
  } catch (err) {
    console.error('[auditLog] Failed to write audit record:', err.message)
  }
}
