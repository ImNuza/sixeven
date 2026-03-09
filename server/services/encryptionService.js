/**
 * Field-level encryption — AES-256-GCM
 *
 * Industry standard used by banks and PCI-DSS compliant fintech.
 * Every encrypted value is self-contained:
 *   v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * The auth tag (128-bit) provides authenticated encryption — any
 * tampering with the ciphertext or metadata is detected on decrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12    // 96-bit IV — optimal for GCM
const TAG_BYTES = 16   // 128-bit auth tag — NIST recommended
const VERSION = 'v1'

// Crash-fast at startup if ENCRYPTION_KEY is missing or too short,
// matching the same pattern as AUTH_SECRET in authService.js.
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length < 64) {
  throw new Error('[encryptionService] ENCRYPTION_KEY must be a 32-byte (64 hex char) value in .env')
}
const KEY_BUF = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

function getKey() {
  return KEY_BUF
}

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns null/undefined passthrough so nullable columns stay nullable.
 */
export function encrypt(plaintext) {
  if (plaintext == null) return plaintext
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt an AES-256-GCM ciphertext produced by encrypt().
 * Returns the original value unchanged if it is not an encrypted blob
 * (allows safe migration — unencrypted legacy rows are passed through).
 */
export function decrypt(ciphertext) {
  if (ciphertext == null) return ciphertext
  const str = String(ciphertext)
  // Pass-through for plaintext legacy rows during migration
  if (!str.startsWith(`${VERSION}:`)) return str
  const [, ivHex, tagHex, dataHex] = str.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted field')
  const key = getKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Encrypt a JSON object (JSONB fields like asset.details).
 * Returns the object unchanged if null/empty.
 */
export function encryptJSON(obj) {
  if (obj == null) return obj
  return encrypt(JSON.stringify(obj))
}

/**
 * Decrypt a JSON object that was encrypted with encryptJSON().
 */
export function decryptJSON(ciphertext) {
  if (ciphertext == null) return ciphertext
  // Already a plain object (in-memory before encryption or legacy)
  if (typeof ciphertext === 'object') return ciphertext
  const str = decrypt(String(ciphertext))
  try { return JSON.parse(str) } catch { return str }
}

/**
 * Deterministic HMAC-SHA256 of a value — used for equality lookups
 * on encrypted columns (e.g. checking email uniqueness without
 * decrypting the whole table).
 */
export function hmacLookup(value) {
  if (value == null) return null
  return createHmac('sha256', getKey()).update(String(value).toLowerCase()).digest('hex')
}
