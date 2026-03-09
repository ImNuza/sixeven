/**
 * Authentication service
 *
 * Password hashing  — Argon2id (OWASP 2024 recommendation)
 *   memory=19MB, iterations=2, parallelism=1
 *
 * Token signing     — HMAC-SHA512 with minimum 48-byte secret
 *   TTL: 8 hours (aligned with banking session norms)
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import '../env.js'

// Crash-fast if secret is missing or too weak
const AUTH_SECRET = process.env.AUTH_SECRET
if (!AUTH_SECRET || Buffer.from(AUTH_SECRET, 'hex').length < 48) {
  throw new Error(
    '[authService] AUTH_SECRET must be a hex string of at least 48 bytes (96 chars) in .env'
  )
}
const SECRET_BUF = Buffer.from(AUTH_SECRET, 'hex')

export const TOKEN_TTL_MS = 1000 * 60 * 60 * 8 // 8 hours

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

function encode(data) { return Buffer.from(data).toString('base64url') }
function decode(data) { return Buffer.from(data, 'base64url').toString('utf8') }
function signPayload(payload) {
  return createHmac('sha512', SECRET_BUF).update(payload).digest('base64url')
}

export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false
  try { return await argon2.verify(storedHash, password) } catch { return false }
}

export function signAuthToken(user) {
  const payload = encode(JSON.stringify({
    sub: Number(user.id),
    username: user.username,
    jti: randomUUID(),        // unique token ID — used for denylist revocation
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  }))
  return `${payload}.${signPayload(payload)}`
}

export function verifyAuthToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  const expected = Buffer.from(signPayload(payload), 'base64url')
  const provided = Buffer.from(signature, 'base64url')
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null
  let parsed
  try { parsed = JSON.parse(decode(payload)) } catch { return null }
  if (!parsed.exp || parsed.exp < Date.now()) return null
  return { id: Number(parsed.sub), username: parsed.username, jti: parsed.jti, exp: parsed.exp }
}
