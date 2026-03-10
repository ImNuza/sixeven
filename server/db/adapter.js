/**
 * Database Adapter Layer
 * 
 * Provides a unified interface for both PostgreSQL and SQLite.
 * Automatically falls back to SQLite when DATABASE_URL is not set.
 */

import pg from 'pg'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import '../env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Force SQLite with USE_SQLITE=true, otherwise use PostgreSQL if DATABASE_URL is set
const forceSqlite = process.env.USE_SQLITE === 'true'
export const DB_TYPE = (!forceSqlite && process.env.DATABASE_URL) ? 'postgres' : 'sqlite'

/**
 * Convert PostgreSQL-style $1, $2 placeholders to SQLite ? placeholders
 * Also returns remapped params since PostgreSQL allows reusing $n but SQLite's ? are sequential
 */
function convertPlaceholders(sql, params = []) {
  const placeholderPattern = /\$(\d+)/g
  const mappedParams = []
  let match
  
  // Collect all placeholder references in order
  while ((match = placeholderPattern.exec(sql)) !== null) {
    const paramIndex = parseInt(match[1], 10) - 1 // $1 -> index 0
    mappedParams.push(
      (paramIndex >= 0 && paramIndex < params.length) ? params[paramIndex] : null
    )
  }
  
  // Replace all $n with ?
  const convertedSql = sql.replace(/\$\d+/g, '?')
  
  return { sql: convertedSql, params: mappedParams }
}

/**
 * Convert PostgreSQL-specific SQL syntax to SQLite-compatible syntax
 * Takes params to properly remap placeholder indices
 */
function convertSqlForSqlite(sql, params = []) {
  // First do placeholder conversion (returns sql with ? and remapped params)
  const { sql: sqlWithPlaceholders, params: mappedParams } = convertPlaceholders(sql, params)
  let converted = sqlWithPlaceholders
  
  // PostgreSQL type casts
  converted = converted.replace(/::int\b/gi, '')
  converted = converted.replace(/::integer\b/gi, '')
  converted = converted.replace(/::text\b/gi, '')
  converted = converted.replace(/::jsonb?\b/gi, '')
  converted = converted.replace(/::timestamptz?\b/gi, '')
  converted = converted.replace(/::date\b/gi, '')
  converted = converted.replace(/::numeric\b/gi, '')
  
  // PostgreSQL functions -> SQLite equivalents
  converted = converted.replace(/\bNOW\(\)/gi, "datetime('now')")
  converted = converted.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')")
  
  // date_trunc('month', CURRENT_DATE) -> date('now', 'start of month')
  converted = converted.replace(
    /date_trunc\s*\(\s*'month'\s*,\s*CURRENT_DATE\s*\)/gi,
    "date('now', 'start of month')"
  )
  converted = converted.replace(
    /date_trunc\s*\(\s*'year'\s*,\s*CURRENT_DATE\s*\)/gi,
    "date('now', 'start of year')"
  )
  converted = converted.replace(
    /date_trunc\s*\(\s*'day'\s*,\s*CURRENT_DATE\s*\)/gi,
    "date('now')"
  )
  
  // CURRENT_DATE replacement (must come after date_trunc replacements)
  converted = converted.replace(/\bCURRENT_DATE\b/gi, "date('now')")
  
  // ILIKE -> LIKE (SQLite LIKE is case-insensitive by default for ASCII)
  converted = converted.replace(/\bILIKE\b/gi, 'LIKE')
  
  // PostgreSQL UPSERT syntax is compatible with SQLite >= 3.24
  // ON CONFLICT ... DO UPDATE SET ... works in both
  
  return { sql: converted, params: mappedParams }
}

// ── SQLite Adapter ────────────────────────────────────────────

class SQLiteClient {
  constructor(db, inTransaction = false) {
    this.db = db
    this.inTransaction = inTransaction
  }

  async query(sql, params = []) {
    const { sql: convertedSql, params: convertedParams } = convertSqlForSqlite(sql, params)
    // Stringify objects for SQLite TEXT columns
    const finalParams = convertedParams.map(p => {
      if (p === undefined) return null
      if (typeof p === 'boolean') return p ? 1 : 0
      if (typeof p === 'object' && p !== null) return JSON.stringify(p)
      return p
    })
    const trimmedSql = convertedSql.trim().toUpperCase()
    
    try {
      if (trimmedSql === 'BEGIN' || trimmedSql === 'BEGIN TRANSACTION') {
        this.db.exec('BEGIN TRANSACTION')
        this.inTransaction = true
        return { rows: [], rowCount: 0 }
      }
      
      if (trimmedSql === 'COMMIT') {
        this.db.exec('COMMIT')
        this.inTransaction = false
        return { rows: [], rowCount: 0 }
      }
      
      if (trimmedSql === 'ROLLBACK') {
        this.db.exec('ROLLBACK')
        this.inTransaction = false
        return { rows: [], rowCount: 0 }
      }
      
      // Handle multiple statements (like schema creation)
      if (convertedSql.includes(';') && !trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('INSERT') && !trimmedSql.startsWith('UPDATE') && !trimmedSql.startsWith('DELETE')) {
        const statements = convertedSql.split(';').filter(s => s.trim())
        for (const stmt of statements) {
          if (stmt.trim()) {
            try {
              this.db.exec(stmt)
            } catch (err) {
              // Ignore certain expected errors in schema migrations
              if (!err.message.includes('duplicate column name') && 
                  !err.message.includes('already exists') &&
                  !err.message.includes('no such column')) {
                throw err
              }
            }
          }
        }
        return { rows: [], rowCount: 0 }
      }
      
      // Determine if this is a SELECT or a modifying query
      if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
        const stmt = this.db.prepare(convertedSql)
        const rows = stmt.all(...finalParams)
        return { rows, rowCount: rows.length }
      } else {
        // INSERT, UPDATE, DELETE
        const stmt = this.db.prepare(convertedSql)
        const info = stmt.run(...finalParams)
        
        // Handle RETURNING clause for INSERT
        if (trimmedSql.includes('RETURNING')) {
          // SQLite doesn't support RETURNING, so we need to fetch the last inserted row
          const returningMatch = convertedSql.match(/RETURNING\s+(.+)$/i)
          if (returningMatch && info.lastInsertRowid) {
            // Extract table name from INSERT statement
            const tableMatch = convertedSql.match(/INSERT\s+INTO\s+(\w+)/i)
            if (tableMatch) {
              const table = tableMatch[1]
              const selectStmt = this.db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`)
              const row = selectStmt.get(info.lastInsertRowid)
              return { rows: row ? [row] : [], rowCount: 1 }
            }
          }
          
          // For UPDATE with RETURNING
          if (trimmedSql.startsWith('UPDATE')) {
            return { rows: [], rowCount: info.changes }
          }
        }
        
        return { rows: [], rowCount: info.changes }
      }
    } catch (err) {
      console.error('[SQLite] Query error:', err.message)
      console.error('[SQLite] SQL:', convertedSql)
      console.error('[SQLite] Params:', params)
      throw err
    }
  }

  release() {
    // No-op for SQLite - we use a single connection
  }
}

class SQLitePool {
  constructor(dbPath, Database) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    console.log(`[db] Using SQLite database at ${dbPath}`)
  }

  async query(sql, params = []) {
    const client = new SQLiteClient(this.db)
    return client.query(sql, params)
  }

  async connect() {
    return new SQLiteClient(this.db)
  }

  async end() {
    this.db.close()
  }
}

// ── PostgreSQL Adapter ────────────────────────────────────────

class PostgresPool {
  constructor(connectionString) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
    })
    console.log('[db] Using PostgreSQL database')
  }

  async query(sql, params = []) {
    return this.pool.query(sql, params)
  }

  async connect() {
    return this.pool.connect()
  }

  async end() {
    return this.pool.end()
  }
}

// ── Factory ────────────────────────────────────────────────────

export function createPool() {
  if (DB_TYPE === 'postgres') {
    return new PostgresPool(process.env.DATABASE_URL)
  } else {
    let Database
    try {
      const sqlite = requireBetterSqlite()
      Database = sqlite.default || sqlite
    } catch (error) {
      throw new Error(`[db] SQLite fallback requires better-sqlite3 to be installed: ${error.message}`)
    }
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'safeseven.db')
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    return new SQLitePool(dbPath, Database)
  }
}

export { convertSqlForSqlite, convertPlaceholders }

function requireBetterSqlite() {
  return require('better-sqlite3')
}
