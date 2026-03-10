export const ASSET_CATEGORIES = {
  CASH: 'Cash & Bank Accounts',
  STOCKS: 'Brokerage / Stocks / ETFs',
  CRYPTO: 'Crypto',
  PROPERTY: 'Property',
  CPF: 'CPF / Retirement',
  BONDS: 'Bonds / Fixed Income',
  FOREX: 'Foreign Currency',
  OTHER: 'Other',
}

export const CATEGORY_COLORS = {
  CASH: '#3B82F6',
  STOCKS: '#8B5CF6',
  CRYPTO: '#F59E0B',
  PROPERTY: '#10B981',
  CPF: '#06B6D4',
  BONDS: '#EC4899',
  FOREX: '#F97316',
  OTHER: '#6B7280',
}

// Maps common uppercase ticker symbols to CoinGecko IDs for price lookups.
// Wallet imports produce symbols like "ETH" but CoinGecko expects "ethereum".
export const SYMBOL_TO_COINGECKO_ID = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  LTC: 'litecoin',
  ATOM: 'cosmos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SHIB: 'shiba-inu',
  AAVE: 'aave',
  FIL: 'filecoin',
  NEAR: 'near',
  APT: 'aptos',
  SUI: 'sui',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
  stETH: 'staked-ether',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  BUSD: 'binance-usd',
  TUSD: 'true-usd',
  FRAX: 'frax',
  USDP: 'pax-dollar',
}

// Resolves any ticker format (symbol or CoinGecko ID) to a CoinGecko ID.
export function resolveCoinGeckoId(ticker) {
  if (!ticker) return null
  const upper = ticker.toUpperCase()
  if (SYMBOL_TO_COINGECKO_ID[upper]) return SYMBOL_TO_COINGECKO_ID[upper]
  // Already a CoinGecko ID (lowercase, often multi-word like "bitcoin")
  return ticker.toLowerCase()
}

// Stablecoins should be treated as cash-equivalents, not volatile crypto.
const STABLECOIN_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'frax', 'pax-dollar',
  'usdt', 'usdc', 'busd', 'tusd', 'usdp',
])

export function isStablecoin(ticker) {
  if (!ticker) return false
  return STABLECOIN_IDS.has(ticker.toLowerCase())
}

export const WELLNESS_THRESHOLDS = {
  DIVERSIFICATION_MAX: 0.4,
  LIQUIDITY_TARGET: 0.2,
  CRYPTO_MAX: 0.3,
  EMERGENCY_FUND_MONTHS: 6,
  MONTHLY_EXPENSES: 3000,
  SINGLE_ASSET_MAX: 0.25,
  GROWTH_TARGET_MONTHLY: 0.5,
  INCOME_GENERATING_TARGET: 0.3,
  REBALANCING_DRIFT_MAX: 0.10,
}

export const WELLNESS_WEIGHTS = {
  diversification: 11,
  liquidity: 11,
  cryptoExposure: 9,
  emergencyFund: 11,
  concentrationRisk: 11,
  assetGrowthTrend: 9,
  incomeGenerating: 9,
  debtHealth: 11,
  rebalancingAlert: 9,
  savingsRate: 9,                   // Income vs expenses health
}

/**
 * Parse a monthly-expenses range string into a numeric midpoint (monthly SGD).
 * Returns null when the range is not recognised so callers can fall back to defaults.
 */
export function parseMonthlyExpenses(range) {
  if (!range) return null
  const map = {
    'Below S$2,000': 1500,
    'S$2,000 - S$4,000': 3000,
    'S$4,001 - S$7,000': 5500,
    'S$7,001 - S$10,000': 8500,
    'Above S$10,000': 12000,
  }
  return map[range] ?? null
}

/**
 * Parse an annual-income range string into a numeric midpoint (annual SGD).
 */
export function parseAnnualIncome(range) {
  if (!range) return null
  const map = {
    'Below S$30,000': 24000,
    'S$30,000 - S$60,000': 45000,
    'S$60,001 - S$100,000': 80000,
    'S$100,001 - S$180,000': 140000,
    'Above S$180,000': 220000,
  }
  return map[range] ?? null
}

/**
 * Return a copy of WELLNESS_THRESHOLDS adjusted for the user's risk appetite.
 * Conservative → tighter limits, bigger safety buffers.
 * Aggressive   → wider risk tolerance, smaller safety buffers.
 * Moderate / unknown → unchanged defaults.
 */
export function getRiskAdjustedThresholds(riskAppetite) {
  const t = { ...WELLNESS_THRESHOLDS }
  if (riskAppetite === 'Conservative') {
    t.CRYPTO_MAX = 0.15
    t.DIVERSIFICATION_MAX = 0.35
    t.SINGLE_ASSET_MAX = 0.20
    t.EMERGENCY_FUND_MONTHS = 9
    t.DEBT_TO_ASSET_MAX = 0.35
  } else if (riskAppetite === 'Aggressive') {
    t.CRYPTO_MAX = 0.40
    t.DIVERSIFICATION_MAX = 0.50
    t.SINGLE_ASSET_MAX = 0.35
    t.EMERGENCY_FUND_MONTHS = 3
    t.DEBT_TO_ASSET_MAX = 0.60
  }
  return t
}

export const TARGET_ALLOCATION = {
  CASH: 0.10,
  STOCKS: 0.30,
  CRYPTO: 0.10,
  PROPERTY: 0.20,
  CPF: 0.15,
  BONDS: 0.10,
  FOREX: 0.02,
  OTHER: 0.03,
}

// ── Projection assumptions for What-If scenario engine ───────────
export const PROJECTION_ASSUMPTIONS = {
  ANNUAL_RETURNS: {
    CASH: 0.02,       // savings account interest
    STOCKS: 0.07,     // long-term equity average
    CRYPTO: 0.00,     // too volatile to assume growth
    PROPERTY: 0.03,   // Singapore property appreciation
    CPF: 0.035,       // weighted average CPF interest
    BONDS: 0.035,     // Singapore T-bill / SSB average
    FOREX: 0.00,      // no assumed return
    OTHER: 0.00,      // no assumed return
  },
  INFLATION_RATE: 0.03,
}

// Estimated BTO prices by flat type (Singapore, 2025/2026 ranges)
export const BTO_PRICES = {
  '2-Room Flexi': 100000,
  '3-Room': 200000,
  '4-Room': 350000,
  '5-Room': 450000,
}
