export const STARTER_ASSETS = [
  {
    name: 'DBS Savings Account',
    category: 'CASH',
    ticker: null,
    value: 15000,
    cost: 15000,
    quantity: null,
    date: '2020-01-01',
    institution: 'DBS',
    details: {},
  },
  {
    name: 'MariBank Savings',
    category: 'CASH',
    ticker: null,
    value: 5000,
    cost: 5000,
    quantity: null,
    date: '2023-03-01',
    institution: 'MariBank',
    details: {},
  },
  {
    name: 'AAPL (Apple Inc.)',
    category: 'STOCKS',
    ticker: 'AAPL',
    value: 8000,
    cost: 6200,
    quantity: 40.5,
    date: '2022-05-10',
    institution: 'moomoo',
    details: {},
  },
  {
    name: 'VT (Vanguard Total World)',
    category: 'STOCKS',
    ticker: 'VT',
    value: 12000,
    cost: 10500,
    quantity: 120,
    date: '2021-11-20',
    institution: 'moomoo',
    details: {},
  },
  {
    name: 'STI ETF',
    category: 'STOCKS',
    ticker: 'ES3.SI',
    value: 6000,
    cost: 5800,
    quantity: 200,
    date: '2023-01-15',
    institution: 'Tiger Brokers',
    details: {},
  },
  {
    name: 'Bitcoin (BTC)',
    category: 'CRYPTO',
    ticker: 'bitcoin',
    value: 20000,
    cost: 12000,
    quantity: 0.24,
    date: '2021-08-01',
    institution: 'Ledger Wallet',
    details: {},
  },
  {
    name: 'Ethereum (ETH)',
    category: 'CRYPTO',
    ticker: 'ethereum',
    value: 8000,
    cost: 5500,
    quantity: 3.5,
    date: '2021-09-15',
    institution: 'MetaMask',
    details: {},
  },
  {
    name: 'Condo (Tampines)',
    category: 'PROPERTY',
    ticker: null,
    value: 450000,
    cost: 380000,
    quantity: null,
    date: '2019-06-01',
    institution: 'Private',
    details: {
      address: 'Tampines, Singapore',
      tenureType: '99-year Leasehold',
      occupancyType: 'Own Stay',
      remainingLoan: '250000',
    },
  },
  {
    name: 'CPF Ordinary Account',
    category: 'CPF',
    ticker: null,
    value: 45000,
    cost: 45000,
    quantity: null,
    date: '2018-01-01',
    institution: 'CPF Board',
    details: {
      accountType: 'OA',
      annualInterestRate: '2.5',
    },
  },
  {
    name: 'CPF Special Account',
    category: 'CPF',
    ticker: null,
    value: 20000,
    cost: 20000,
    quantity: null,
    date: '2018-01-01',
    institution: 'CPF Board',
    details: {
      accountType: 'SA',
      annualInterestRate: '4.0',
    },
  },
  {
    name: 'Singapore Savings Bond',
    category: 'BONDS',
    ticker: null,
    value: 10000,
    cost: 10000,
    quantity: null,
    date: '2023-07-01',
    institution: 'MAS',
    details: {
      issuer: 'MAS',
      maturityDate: '2033-07-01',
      couponRate: '3.04',
    },
  },
]

export const STARTER_SNAPSHOTS = [
  { value: 545000, snapshotDate: '2025-10-31', source: 'seed' },
  { value: 558000, snapshotDate: '2025-11-30', source: 'seed' },
  { value: 562000, snapshotDate: '2025-12-31', source: 'seed' },
  { value: 571000, snapshotDate: '2026-01-31', source: 'seed' },
  { value: 585000, snapshotDate: '2026-02-28', source: 'seed' },
  { value: 599000, snapshotDate: '2026-03-04', source: 'seed' },
]

export async function seedStarterPortfolio(client, userId) {
  for (const asset of STARTER_ASSETS) {
    // Stringify details object for storage (SQLite stores as TEXT, PostgreSQL as JSONB)
    const detailsJson = typeof asset.details === 'string' 
      ? asset.details 
      : JSON.stringify(asset.details || {})
    
    await client.query(
      `INSERT INTO assets (user_id, name, category, ticker, value, cost, quantity, date, institution, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        asset.name,
        asset.category,
        asset.ticker,
        asset.value,
        asset.cost,
        asset.quantity,
        asset.date,
        asset.institution,
        detailsJson,
      ]
    )
  }

  for (const snapshot of STARTER_SNAPSHOTS) {
    await client.query(
      `INSERT INTO net_worth_snapshots (user_id, value, snapshot_date, source)
       VALUES ($1, $2, $3, $4)`,
      [userId, snapshot.value, snapshot.snapshotDate, snapshot.source]
    )
  }
}
