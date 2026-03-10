import { fetchWalletPortfolio, isZerionConfigured } from './zerionService.js'

/**
 * Automatically fetch and import crypto assets from wallet addresses.
 * This service syncs wallet portfolio data into the assets table.
 */

/**
 * Fetch all wallet addresses for a user from wallet_connections table
 */
export async function getUserWalletAddresses(pool, userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT address FROM wallet_connections WHERE user_id = $1`,
    [userId]
  )
  return rows.map(r => r.address)
}

/**
 * Fetch portfolio data for all user wallets and return normalized tokens
 */
export async function fetchUserWalletsPortfolio(pool, userId) {
  if (!isZerionConfigured()) {
    throw new Error('Zerion API not configured')
  }

  const addresses = await getUserWalletAddresses(pool, userId)
  if (!addresses.length) {
    return []
  }

  console.log(`[WalletSync] Fetching portfolio for ${addresses.length} wallet(s): ${addresses.join(', ')}`)

  const allTokens = []
  const failures = []

  // Fetch portfolio for each wallet address in parallel
  const results = await Promise.allSettled(
    addresses.map(async (address) => {
      try {
        const tokens = await fetchWalletPortfolio(address)
        console.log(`[WalletSync] ${address}: Fetched ${tokens.length} tokens`)
        return { address, tokens }
      } catch (err) {
        console.error(`[WalletSync] ${address}: Error - ${err.message}`)
        failures.push({ address, error: err.message })
        return { address, tokens: [] }
      }
    })
  )

  // Collect all tokens from successful fetches
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.tokens) {
      allTokens.push(...result.value.tokens)
    }
  })

  console.log(`[WalletSync] Total tokens collected: ${allTokens.length}, failures: ${failures.length}`)

  return { allTokens, failures }
}

/**
 * Create or update assets for wallet tokens
 * Merges tokens from same symbol, creates assets with wallet source tag
 */
export async function syncWalletTokensToAssets(pool, userId, tokens, recordNetWorthSnapshot) {
  if (!tokens.length) {
    console.log(`[WalletSync] No tokens to sync`)
    return { created: 0, updated: 0, errors: [] }
  }

  // Tag to identify assets created from wallet sync
  const WALLET_SYNC_TAG = 'wallet-auto-sync'

  // Group tokens by symbol (merge same token from different wallets)
  const tokensBySymbol = {}
  tokens.forEach(token => {
    if (!tokensBySymbol[token.symbol]) {
      tokensBySymbol[token.symbol] = {
        ...token,
        balance: 0,
        valueUsd: 0,
      }
    }
    // Merge balances and values
    tokensBySymbol[token.symbol].balance += token.balance
    tokensBySymbol[token.symbol].valueUsd += token.valueUsd
  })

  const client = await pool.connect()
  let created = 0
  let updated = 0
  const errors = []

  try {
    await client.query('BEGIN')

    for (const [symbol, token] of Object.entries(tokensBySymbol)) {
      try {
        // Check if this token already exists as a wallet-synced asset
        const existingResult = await client.query(
          `SELECT id FROM assets 
           WHERE user_id = $1 
           AND ticker = $2 
           AND category = 'Crypto'
           AND json_extract(details, '$.source') = $3
           LIMIT 1`,
          [userId, symbol, WALLET_SYNC_TAG]
        )

        if (existingResult.rows.length > 0) {
          // Update existing asset
          const assetId = existingResult.rows[0].id
          const roundedValue = Math.round(token.valueUsd * 100) / 100
          await client.query(
            `UPDATE assets 
             SET quantity = $1, value = $2, date = $3, updated_at = NOW()
             WHERE id = $4`,
            [token.balance, roundedValue, new Date().toISOString().split('T')[0], assetId]
          )
          updated++
          console.log(`[WalletSync] Updated ${symbol}: balance=${token.balance}, value=$${roundedValue}`)
        } else {
          // Create new asset
          const roundedValue = Math.round(token.valueUsd * 100) / 100
          const details = {
            source: WALLET_SYNC_TAG,
            coingeckoId: token.coingeckoId,
            contractAddress: token.contractAddress,
            chainId: token.chainId,
            logo: token.logo,
            lastSyncedAt: new Date().toISOString(),
          }

          await client.query(
            `INSERT INTO assets (user_id, name, category, ticker, quantity, value, cost, date, institution, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              userId,
              token.name || symbol,
              'Crypto',
              symbol,
              token.balance,
              roundedValue,
              0, // cost
              new Date().toISOString().split('T')[0],
              'Auto-synced Wallet',
              JSON.stringify(details),
            ]
          )
          created++
          console.log(`[WalletSync] Created ${symbol}: balance=${token.balance}, value=$${roundedValue}`)
        }
      } catch (err) {
        const errorMsg = `Failed to sync ${symbol}: ${err.message}`
        console.error(`[WalletSync] ${errorMsg}`)
        errors.push({ symbol, error: errorMsg })
      }
    }

    // Record net worth snapshot for wallet sync event
    if (created > 0 || updated > 0) {
      await recordNetWorthSnapshot(userId, 'wallet_auto_sync', client)
    }

    await client.query('COMMIT')
  } catch (err) {
    console.error(`[WalletSync] Transaction error: ${err.message}`)
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { created, updated, errors }
}

/**
 * Full wallet sync pipeline:
 * 1. Fetch all wallet addresses for user
 * 2. Get portfolio data from Zerion for each wallet
 * 3. Combine and create/update assets
 */
export async function performFullWalletSync(pool, userId, recordNetWorthSnapshot) {
  try {
    const { allTokens, failures } = await fetchUserWalletsPortfolio(pool, userId)
    const syncResult = await syncWalletTokensToAssets(pool, userId, allTokens, recordNetWorthSnapshot)

    return {
      success: true,
      created: syncResult.created,
      updated: syncResult.updated,
      walletFailures: failures,
      assetErrors: syncResult.errors,
      totalTokensProcessed: allTokens.length,
    }
  } catch (err) {
    console.error(`[WalletSync] Full sync failed: ${err.message}`)
    return {
      success: false,
      error: err.message,
      created: 0,
      updated: 0,
    }
  }
}

/**
 * Purge all auto-synced wallet assets for a user (useful for clean re-syncing)
 */
export async function purgeAutoSyncedAssets(pool, userId) {
  const WALLET_SYNC_TAG = 'wallet-auto-sync'

  const result = await pool.query(
    `DELETE FROM assets 
     WHERE user_id = $1 
     AND category = 'Crypto'
     AND json_extract(details, '$.source') = $2`,
    [userId, WALLET_SYNC_TAG]
  )

  console.log(`[WalletSync] Purged ${result.rowCount} auto-synced assets for user ${userId}`)
  return result.rowCount
}
