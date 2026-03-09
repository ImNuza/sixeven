import test from 'node:test'
import assert from 'node:assert/strict'
import { convertPlaceholders } from '../db/adapter.js'

test('convertPlaceholders maps repeated placeholders in order', () => {
  const inputSql = 'SELECT * FROM users WHERE id = $1 OR manager_id = $1 AND status = $2'
  const { sql, params } = convertPlaceholders(inputSql, [42, 'active'])

  assert.equal(sql, 'SELECT * FROM users WHERE id = ? OR manager_id = ? AND status = ?')
  assert.deepEqual(params, [42, 42, 'active'])
})

test('convertPlaceholders fills missing placeholder values with null instead of dropping them', () => {
  const inputSql = 'SELECT * FROM users WHERE id = $1 AND email = $2'
  const { sql, params } = convertPlaceholders(inputSql, [99])

  assert.equal(sql, 'SELECT * FROM users WHERE id = ? AND email = ?')
  assert.deepEqual(params, [99, null])
})
