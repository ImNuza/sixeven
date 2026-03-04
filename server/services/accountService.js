import { hashPassword, signAuthToken, verifyPassword } from './authService.js'
import { seedStarterPortfolio } from '../db/seedData.js'

function sanitizeUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    email: user.email || null,
    createdAt: user.created_at,
  }
}

function normalizeEmail(email) {
  const trimmed = String(email || '').trim().toLowerCase()
  return trimmed || null
}

function validateEmail(email) {
  if (!email) {
    return ''
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? ''
    : 'Email must be a valid address.'
}

export function validateCredentials({ username, password, email }) {
  if (!String(username || '').trim()) {
    return 'Username is required.'
  }

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(String(username || ''))) {
    return 'Username must be 3-24 characters and use only letters, numbers, or underscores.'
  }

  if (String(password || '').length < 8) {
    return 'Password must be at least 8 characters.'
  }

  const emailError = validateEmail(normalizeEmail(email))
  if (emailError) {
    return emailError
  }

  return ''
}

export async function createUserAccount(pool, { username, password, email }) {
  const validationError = validateCredentials({ username, password, email })
  if (validationError) {
    const error = new Error(validationError)
    error.statusCode = 400
    throw error
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const trimmedUsername = username.trim()

    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [trimmedUsername]
    )
    if (existing.rows.length) {
      const error = new Error('Username is already taken.')
      error.statusCode = 409
      throw error
    }

    const normalizedEmail = normalizeEmail(email)
    if (normalizedEmail) {
      const emailExisting = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [normalizedEmail]
      )
      if (emailExisting.rows.length) {
        const error = new Error('Email is already in use.')
        error.statusCode = 409
        throw error
      }
    }

    const passwordHash = await hashPassword(password)
    const { rows } = await client.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [trimmedUsername, normalizedEmail, passwordHash]
    )

    await seedStarterPortfolio(client, rows[0].id)
    await client.query('COMMIT')

    const user = sanitizeUser(rows[0])
    return {
      user,
      token: signAuthToken(user),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function authenticateAccount(pool, { username, password }) {
  const { rows } = await pool.query(
    'SELECT id, username, email, created_at, password_hash FROM users WHERE username = $1',
    [String(username || '').trim()]
  )

  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
    const error = new Error('Invalid username or password.')
    error.statusCode = 401
    throw error
  }

  const user = sanitizeUser(rows[0])
  return {
    user,
    token: signAuthToken(user),
  }
}

export async function getUserById(pool, id) {
  const { rows } = await pool.query(
    'SELECT id, username, email, created_at FROM users WHERE id = $1',
    [id]
  )

  return rows[0] ? sanitizeUser(rows[0]) : null
}

export async function changePassword(pool, userId, { currentPassword, newPassword }) {
  if (String(newPassword || '').length < 8) {
    const error = new Error('New password must be at least 8 characters.')
    error.statusCode = 400
    throw error
  }

  const { rows } = await pool.query(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [userId]
  )

  if (!rows.length || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    const error = new Error('Current password is incorrect.')
    error.statusCode = 401
    throw error
  }

  const passwordHash = await hashPassword(newPassword)
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId]
  )

  const user = await getUserById(pool, userId)
  return {
    user,
    token: signAuthToken(user),
  }
}

export async function deleteAccount(pool, userId, { password }) {
  const { rows } = await pool.query(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [userId]
  )

  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
    const error = new Error('Password is incorrect.')
    error.statusCode = 401
    throw error
  }

  await pool.query('DELETE FROM users WHERE id = $1', [userId])
  return { deleted: true }
}

export async function updateProfile(pool, userId, { email }) {
  const normalizedEmail = normalizeEmail(email)
  const emailError = validateEmail(normalizedEmail)
  if (emailError) {
    const error = new Error(emailError)
    error.statusCode = 400
    throw error
  }

  if (normalizedEmail) {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id <> $2',
      [normalizedEmail, userId]
    )
    if (rows.length) {
      const error = new Error('Email is already in use.')
      error.statusCode = 409
      throw error
    }
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET email = $1
     WHERE id = $2
     RETURNING id, username, email, created_at`,
    [normalizedEmail, userId]
  )

  return {
    user: sanitizeUser(rows[0]),
  }
}
