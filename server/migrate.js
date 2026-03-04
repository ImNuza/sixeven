import { pool } from './db.js'

const schema = `
  CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
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
    value NUMERIC(15,2) NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(40) NOT NULL DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE net_worth_snapshots
    ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'seed';
`

const seed = `
  INSERT INTO assets (name, category, ticker, value, cost, quantity, date, institution, details)
  VALUES
    ('DBS Savings Account',       'CASH',     NULL,   15000,  15000,  NULL,       '2020-01-01', 'DBS', '{}'::jsonb),
    ('MariBank Savings',          'CASH',     NULL,   5000,   5000,   NULL,       '2023-03-01', 'MariBank', '{}'::jsonb),
    ('AAPL (Apple Inc.)',         'STOCKS',   'AAPL', 8000,   6200,   40.5,       '2022-05-10', 'moomoo', '{}'::jsonb),
    ('VT (Vanguard Total World)', 'STOCKS',   'VT',   12000,  10500,  120.0,      '2021-11-20', 'moomoo', '{}'::jsonb),
    ('STI ETF',                   'STOCKS',   'ES3.SI', 6000, 5800,   200.0,      '2023-01-15', 'Tiger Brokers', '{}'::jsonb),
    ('Bitcoin (BTC)',             'CRYPTO',   'bitcoin', 20000, 12000, 0.24,      '2021-08-01', 'Ledger Wallet', '{}'::jsonb),
    ('Ethereum (ETH)',            'CRYPTO',   'ethereum', 8000, 5500, 3.5,        '2021-09-15', 'MetaMask', '{}'::jsonb),
    ('Condo (Tampines)',          'PROPERTY', NULL,   450000, 380000, NULL,       '2019-06-01', 'Private', '{"address":"Tampines, Singapore","tenureType":"99-year Leasehold","occupancyType":"Own Stay"}'::jsonb),
    ('CPF Ordinary Account',      'CPF',      NULL,   45000,  45000,  NULL,       '2018-01-01', 'CPF Board', '{"accountType":"OA","annualInterestRate":"2.5"}'::jsonb),
    ('CPF Special Account',       'CPF',      NULL,   20000,  20000,  NULL,       '2018-01-01', 'CPF Board', '{"accountType":"SA","annualInterestRate":"4.0"}'::jsonb),
    ('Singapore Savings Bond',    'BONDS',    NULL,   10000,  10000,  NULL,       '2023-07-01', 'MAS', '{"issuer":"MAS","maturityDate":"2033-07-01","couponRate":"3.04"}'::jsonb)
  ON CONFLICT DO NOTHING;

  INSERT INTO net_worth_snapshots (value, snapshot_date, source) VALUES
    (545000, '2025-10-31', 'seed'),
    (558000, '2025-11-30', 'seed'),
    (562000, '2025-12-31', 'seed'),
    (571000, '2026-01-31', 'seed'),
    (585000, '2026-02-28', 'seed'),
    (599000, '2026-03-04', 'seed')
  ON CONFLICT DO NOTHING;
`

const backfillDetails = `
  UPDATE assets
  SET details = '{"address":"Tampines, Singapore","tenureType":"99-year Leasehold","occupancyType":"Own Stay"}'::jsonb
  WHERE name = 'Condo (Tampines)' AND (details IS NULL OR details = '{}'::jsonb);

  UPDATE assets
  SET details = '{"accountType":"OA","annualInterestRate":"2.5"}'::jsonb
  WHERE name = 'CPF Ordinary Account' AND (details IS NULL OR details = '{}'::jsonb);

  UPDATE assets
  SET details = '{"accountType":"SA","annualInterestRate":"4.0"}'::jsonb
  WHERE name = 'CPF Special Account' AND (details IS NULL OR details = '{}'::jsonb);

  UPDATE assets
  SET details = '{"issuer":"MAS","maturityDate":"2033-07-01","couponRate":"3.04"}'::jsonb
  WHERE name = 'Singapore Savings Bond' AND (details IS NULL OR details = '{}'::jsonb);
`

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('Running migrations...')
    await client.query(schema)
    console.log('Schema created.')

    const { rows } = await client.query('SELECT COUNT(*) FROM assets')
    if (parseInt(rows[0].count) === 0) {
      await client.query(seed)
      console.log('Seed data inserted.')
    } else {
      console.log('Assets already seeded, skipping.')
    }

    await client.query(backfillDetails)
    console.log('Asset details backfilled.')

    console.log('Migration complete.')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
