import { hashPassword } from '../services/authService.js'
import { seedStarterPortfolio } from './seedData.js'
import { DB_TYPE } from './adapter.js'
import { sqliteSchema } from './sqlite-schema.js'

const SYSTEM_USERNAME = '__seed__'
const SYSTEM_PASSWORD = 'seed-account-disabled'

export const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(120) UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    ticker VARCHAR(20),
    value NUMERIC(15,2) NOT NULL,
    cost NUMERIC(15,2) NOT NULL,
    quantity NUMERIC(20,8),
    date DATE NOT NULL,
    institution VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS price_cache (
    symbol VARCHAR(20) PRIMARY KEY,
    price_usd NUMERIC(20,8),
    price_sgd NUMERIC(20,8),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value NUMERIC(15,2) NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(40) NOT NULL DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(120);

  ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE net_worth_snapshots
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE net_worth_snapshots
    ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'seed';

  CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  CREATE INDEX IF NOT EXISTS idx_assets_user_category_name ON assets (user_id, category, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_value_desc ON assets (user_id, value DESC, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_cost_desc ON assets (user_id, cost DESC, name);
  CREATE INDEX IF NOT EXISTS idx_assets_user_date_desc ON assets (user_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_assets_user_ticker ON assets (user_id, ticker);
  CREATE INDEX IF NOT EXISTS idx_assets_user_name_lower ON assets (user_id, LOWER(name));
  CREATE INDEX IF NOT EXISTS idx_assets_user_institution_lower ON assets (user_id, LOWER(institution));
  CREATE INDEX IF NOT EXISTS idx_snapshots_user_date_created ON net_worth_snapshots (user_id, snapshot_date ASC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_price_cache_updated_at ON price_cache (updated_at DESC);

  CREATE TABLE IF NOT EXISTS wallet_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(42) NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 1,
    label VARCHAR(50),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, address, chain_id)
  );

  CREATE INDEX IF NOT EXISTS idx_wallet_connections_user ON wallet_connections (user_id);

  -- email_hmac: deterministic HMAC for uniqueness lookups without decrypting the table
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_hmac VARCHAR(64);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hmac ON users (email_hmac)
    WHERE email_hmac IS NOT NULL;

  -- revoked_tokens: token denylist — populated on logout / password change
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

  -- audit_log: immutable record of sensitive operations
  CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(80) NOT NULL,
    ip VARCHAR(45),
    user_agent TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS plaid_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(120) NOT NULL,
    access_token TEXT NOT NULL,
    institution_id VARCHAR(80),
    institution_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, item_id)
  );

  CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items (user_id);

  CREATE TABLE IF NOT EXISTS singpass_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    myinfo_sub VARCHAR(100),
    uinfin_masked VARCHAR(20),
    data JSONB NOT NULL DEFAULT '{}',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ocbc_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_ocbc_connections_user ON ocbc_connections (user_id);

  CREATE TABLE IF NOT EXISTS snaptrade_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    snaptrade_user_id VARCHAR(120) NOT NULL,
    user_secret TEXT NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_snaptrade_users_user ON snaptrade_users (user_id);

  CREATE TABLE IF NOT EXISTS linked_demo_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
  );

  CREATE INDEX IF NOT EXISTS idx_linked_demo_accounts_user ON linked_demo_accounts (user_id);
`

export async function ensureSystemSeedUser(client) {
  const { rows: existing } = await client.query(
    'SELECT id FROM users WHERE username = $1',
    [SYSTEM_USERNAME]
  )

  if (existing.length) {
    return existing[0].id
  }

  const passwordHash = await hashPassword(SYSTEM_PASSWORD)
  const { rows } = await client.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     RETURNING id`,
    [SYSTEM_USERNAME, passwordHash]
  )

  return rows[0].id
}

export async function backfillLegacyPortfolio(client, systemUserId) {
  await client.query(
    `UPDATE assets
     SET user_id = $1
     WHERE user_id IS NULL`,
    [systemUserId]
  )

  await client.query(
    `UPDATE net_worth_snapshots
     SET user_id = $1
     WHERE user_id IS NULL`,
    [systemUserId]
  )
}

export async function ensureStarterPortfolio(client, userId) {
  const { rows } = await client.query(
    'SELECT COUNT(*) AS count FROM assets WHERE user_id = $1',
    [userId]
  )

  const count = Number(rows[0]?.count || 0)
  if (count > 0) {
    return false
  }

  await seedStarterPortfolio(client, userId)
  return true
}

export async function runMigrations(client) {
  // Use appropriate schema based on database type
  const schemaToUse = DB_TYPE === 'sqlite' ? sqliteSchema : schema
  await client.query(schemaToUse)

  const systemUserId = await ensureSystemSeedUser(client)
  await backfillLegacyPortfolio(client, systemUserId)
  const seeded = await ensureStarterPortfolio(client, systemUserId)

  return {
    systemUserId,
    seeded,
  }
}
