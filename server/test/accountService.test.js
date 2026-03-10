import test from 'node:test'
import assert from 'node:assert/strict'
import { createUserAccount, updateProfile } from '../services/accountService.js'

test('updateProfile returns the refreshed user record after updating email and reminder day', async () => {
  const queries = []
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params })

      if (sql.includes('SELECT id FROM users WHERE email_hmac = $1 AND id <> $2')) {
        return { rows: [] }
      }

      if (sql.includes('UPDATE users')) {
        return { rows: [], rowCount: 1 }
      }

      if (sql.includes('SELECT id, username, email, review_reminder_day, created_at FROM users WHERE id = $1')) {
        return {
          rows: [{
            id: 7,
            username: 'matth',
            email: params[0] ? queries[1].params[0] : null,
            review_reminder_day: 11,
            created_at: '2026-03-09T00:00:00.000Z',
          }],
          rowCount: 1,
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const result = await updateProfile(pool, 7, { email: 'matth@example.com', reviewReminderDay: 11 })

  assert.equal(result.user.id, 7)
  assert.equal(result.user.username, 'matth')
  assert.equal(result.user.email, 'matth@example.com')
  assert.equal(result.user.reviewReminderDay, 11)
  assert.equal(queries.filter(({ sql }) => sql.includes('UPDATE users')).length, 1)
})

test('createUserAccount does not auto-seed starter assets', async () => {
  const queries = []
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params })

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('SELECT id FROM users WHERE username = $1')) {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('SELECT id FROM users WHERE email_hmac = $1')) {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [{
            id: 42,
            username: 'newuser',
            email: params[1],
            created_at: '2026-03-09T00:00:00.000Z',
          }],
          rowCount: 1,
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
    release() {},
  }

  const pool = {
    async connect() {
      return client
    },
  }

  const result = await createUserAccount(pool, {
    username: 'newuser',
    password: 'password123',
    email: 'newuser@example.com',
  })

  assert.equal(result.user.id, 42)
  assert.equal(result.user.username, 'newuser')
  assert.equal(result.user.email, 'newuser@example.com')
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO assets')), false)
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO net_worth_snapshots')), false)
})
