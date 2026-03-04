import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const AUTH_SECRET = process.env.AUTH_SECRET || 'safeseven-dev-secret'
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7

function encode(data) {
  return Buffer.from(data).toString('base64url')
}

function decode(data) {
  return Buffer.from(data, 'base64url').toString('utf8')
}

function signPayload(payload) {
  return createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':')
  if (!salt || !hash) {
    return false
  }

  const derived = await scrypt(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  const actual = Buffer.from(derived)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function signAuthToken(user) {
  const payload = encode(JSON.stringify({
    sub: Number(user.id),
    username: user.username,
    exp: Date.now() + TOKEN_TTL_MS,
  }))

  return `${payload}.${signPayload(payload)}`
}

export function verifyAuthToken(token) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) {
    return null
  }

  const expected = signPayload(payload)
  const provided = Buffer.from(signature)
  const actual = Buffer.from(expected)
  if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) {
    return null
  }

  const parsed = JSON.parse(decode(payload))
  if (!parsed.exp || parsed.exp < Date.now()) {
    return null
  }

  return {
    id: Number(parsed.sub),
    username: parsed.username,
  }
}
