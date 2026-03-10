import axios from 'axios'

console.log('Testing APIs...\n')

// Test 1: CoinGecko
console.log('1. Testing CoinGecko (bitcoin)...')
try {
  const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,sgd', {
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  })
  console.log('✓ CoinGecko Success:')
  console.log('  BTC USD:', res.data.bitcoin?.usd)
  console.log('  BTC SGD:', res.data.bitcoin?.sgd)
} catch (err) {
  console.error('✗ CoinGecko Error:', err.message)
  if (err.code) console.error('  Code:', err.code)
  if (err.response?.status) console.error('  Status:', err.response.status)
}

// Test 2: Yahoo Finance (BTC-USD)
console.log('\n2. Testing Yahoo Finance (BTC-USD)...')
try {
  const res = await axios.get(
    'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=1d',
    { 
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  )
  const price = res.data?.chart?.result?.[0]?.meta?.regularMarketPrice
  console.log('✓ Yahoo Finance Success:')
  console.log('  BTC-USD:', price)
} catch (err) {
  console.error('✗ Yahoo Finance Error:', err.message)
  if (err.code) console.error('  Code:', err.code)
  if (err.response?.status) console.error('  Status:', err.response.status)
}

// Test 3: Yahoo Finance (USDSGD=X)
console.log('\n3. Testing Yahoo Finance (USDSGD=X - exchange rate)...')
try {
  const res = await axios.get(
    'https://query1.finance.yahoo.com/v8/finance/chart/USDSGD=X?interval=1d&range=1d',
    { 
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  )
  const price = res.data?.chart?.result?.[0]?.meta?.regularMarketPrice
  console.log('✓ Yahoo Finance Success:')
  console.log('  USD/SGD:', price)
} catch (err) {
  console.error('✗ Yahoo Finance Error:', err.message)
  if (err.code) console.error('  Code:', err.code)
  if (err.response?.status) console.error('  Status:', err.response.status)
  if (err.response?.headers) console.error('  Headers:', err.response.headers)
}

process.exit(0)
