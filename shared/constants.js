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
  DEBT_TO_ASSET_MAX: 0.5,          // Debt should be < 50% of total assets
  FOREX_VOLATILITY_MAX: 0.10,      // FOREX should be < 10% of portfolio
  MIN_YIELD_THRESHOLD: 2.0,        // Minimum yield % to count as income-generating
}

export const WELLNESS_WEIGHTS = {
  diversification: 12,
  liquidity: 12,
  cryptoExposure: 10,
  emergencyFund: 12,
  concentrationRisk: 12,
  assetGrowthTrend: 10,
  incomeGenerating: 10,
  debtHealth: 12,                  // New: debt-to-asset ratio
  rebalancingAlert: 10,
}

// Liquidity classification for each category (0-1 scale)
export const CATEGORY_LIQUIDITY = {
  CASH: 1.0,      // Fully liquid
  STOCKS: 0.9,    // Highly liquid (T+2 settlement)
  CRYPTO: 0.85,   // Liquid but volatile
  FOREX: 0.7,     // Liquid but volatile and conversion costs
  BONDS: 0.5,     // Semi-liquid, may have early redemption penalties
  CPF: 0.1,       // Locked until retirement (very illiquid)
  PROPERTY: 0.05, // Very illiquid
  OTHER: 0.3,     // Varies
}

// Volatility classification for risk assessment (0-1, higher = more volatile)
export const CATEGORY_VOLATILITY = {
  CASH: 0.0,
  BONDS: 0.1,
  CPF: 0.05,
  STOCKS: 0.4,
  PROPERTY: 0.2,
  FOREX: 0.5,
  CRYPTO: 0.8,
  OTHER: 0.3,
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
