import { pool, DB_TYPE } from './db.js'

console.log('Database Type:', DB_TYPE)
console.log('\nTesting price cache insert...\n')

try {
  // Test the new upsert logic
  const client = await pool.connect()
  
  console.log('1. Testing PostgreSQL syntax (will fail on SQLite)...')
  try {
    await client.query(
      `INSERT INTO price_cache (symbol, price_usd, price_sgd, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (symbol) DO UPDATE
       SET price_usd = $2, price_sgd = $3, updated_at = NOW()`,
      ['BTC-TEST', 69187, 88181]
    )
    console.log('   ✓ PostgreSQL syntax worked')
  } catch (err) {
    console.log('   ✗ PostgreSQL syntax failed:', err.message.substring(0, 60))
    
    // Try SQLite syntax
    console.log('2. Trying SQLite INSERT OR REPLACE...')
    try {
      await client.query(
        `INSERT OR REPLACE INTO price_cache (symbol, price_usd, price_sgd, updated_at)
         VALUES ($1, $2, $3, datetime('now'))`,
        ['BTC-TEST', 69187, 88181]
      )
      console.log('   ✓ SQLite syntax worked!')
    } catch (err2) {
      console.log('   ✗ SQLite syntax failed:', err2.message.substring(0, 60))
    }
  }
  
  // Check if data was inserted
  console.log('\n3. Checking if data exists in price_cache...')
  const { rows } = await client.query(
    'SELECT symbol, price_usd, price_sgd, updated_at FROM price_cache WHERE symbol LIKE ?BTC%',
    ['%BTC%']
  )
  console.log(`   Found ${rows.length} records with BTC`)
  if (rows.length > 0) {
    console.log('   Sample:', rows[0])
  }
  
  client.release()
  console.log('\n✓ All tests completed')
} catch (err) {
  console.error('Fatal error:', err.message)
}

process.exit(0)
