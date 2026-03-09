import test from 'node:test'
import assert from 'node:assert/strict'
import { updateProfile } from '../services/accountService.js'

test('updateProfile returns the refreshed user record after updating email', async () => {
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

      if (sql.includes('SELECT id, username, email, created_at FROM users WHERE id = $1')) {
        return {
          rows: [{
            id: 7,
            username: 'matth',
            email: params[0] ? queries[1].params[0] : null,
            created_at: '2026-03-09T00:00:00.000Z',
          }],
          rowCount: 1,
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const result = await updateProfile(pool, 7, { email: 'matth@example.com' })

  assert.equal(result.user.id, 7)
  assert.equal(result.user.username, 'matth')
  assert.equal(result.user.email, 'matth@example.com')
  assert.equal(queries.filter(({ sql }) => sql.includes('UPDATE users')).length, 1)
})
