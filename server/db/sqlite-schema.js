/**
 * SQLite-compatible schema
 * 
 * This schema is designed to work with SQLite while maintaining
 * compatibility with the same data model as PostgreSQL.
 */

export const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email TEXT,
    email_hmac VARCHAR(64),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category VARCHAR(20) NOT NULL,
    ticker VARCHAR(20),
    value NUMERIC(15,2) NOT NULL,
    cost NUMERIC(15,2) NOT NULL,
    quantity NUMERIC(20,8),
    date TEXT NOT NULL,
    institution TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_cache (
    symbol VARCHAR(20) PRIMARY KEY,
    price_usd NUMERIC(20,8),
    price_sgd NUMERIC(20,8),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value NUMERIC(15,2) NOT NULL,
    snapshot_date TEXT NOT NULL DEFAULT (date('now')),
    source VARCHAR(40) NOT NULL DEFAULT 'seed',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wallet_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(42) NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 1,
    label VARCHAR(50),
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, address, chain_id)
  );

  CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(80) NOT NULL,
    ip VARCHAR(45),
    user_agent TEXT,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plaid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(120) NOT NULL,
    access_token TEXT NOT NULL,
    institution_id VARCHAR(80),
    institution_name VARCHAR(120),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS singpass_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    myinfo_sub VARCHAR(100),
    uinfin_masked VARCHAR(20),
    data TEXT NOT NULL DEFAULT '{}',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ocbc_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    connected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS snaptrade_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    snaptrade_user_id VARCHAR(120) NOT NULL,
    user_secret TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS linked_demo_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    metadata TEXT NOT NULL DEFAULT '{}',
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, provider)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hmac ON users (email_hmac);
  CREATE INDEX IF NOT EXISTS idx_assets_user_category_name ON assets (user_id, category, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_value_desc ON assets (user_id, value DESC, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_cost_desc ON assets (user_id, cost DESC, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_date_desc ON assets (user_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_assets_user_ticker ON assets (user_id, ticker);
  CREATE INDEX IF NOT EXISTS idx_snapshots_user_date_created ON net_worth_snapshots (user_id, snapshot_date ASC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_price_cache_updated_at ON price_cache (updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wallet_connections_user ON wallet_connections (user_id);
  CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);
  CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items (user_id);
  CREATE INDEX IF NOT EXISTS idx_ocbc_connections_user ON ocbc_connections (user_id);
  CREATE INDEX IF NOT EXISTS idx_snaptrade_users_user ON snaptrade_users (user_id);
  CREATE INDEX IF NOT EXISTS idx_linked_demo_accounts_user ON linked_demo_accounts (user_id);
`

export default sqliteSchema
