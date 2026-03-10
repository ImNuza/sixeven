# Automatic Wallet Portfolio Sync Feature

## Overview

This feature automatically fetches crypto asset holdings from wallet addresses saved during onboarding and creates corresponding assets in the portfolio. Users no longer need to manually import each token—the system fetches complete portfolio data from the Zerion API and syncs it to the assets database.

## Key Components

### Backend Services

#### 1. **walletSyncService.js** (`server/services/walletSyncService.js`)
New service that handles all wallet portfolio syncing logic:

- `getUserWalletAddresses(pool, userId)` - Fetches all wallet addresses from `wallet_connections` table
- `fetchUserWalletsPortfolio(pool, userId)` - Fetches portfolio data from Zerion API for all wallets
- `syncWalletTokensToAssets(pool, userId, tokens, recordNetWorthSnapshot)` - Creates/updates crypto assets
- `performFullWalletSync(pool, userId, recordNetWorthSnapshot)` - Main orchestration function
- `purgeAutoSyncedAssets(pool, userId)` - Cleans up auto-synced assets for re-syncing

**Key Features:**
- Merges tokens with same symbol from multiple wallets
- Tags auto-synced assets with `source: 'wallet-auto-sync'` for easy identification
- Stores metadata (CoinGecko ID, chain info, logo) in asset details
- Non-blocking: wallet sync failures don't prevent onboarding completion
- Comprehensive logging for debugging

### API Endpoints

#### 1. **POST /api/wallet/sync**
Triggers a full wallet portfolio sync for the authenticated user.

**Request:**
```bash
curl -X POST http://localhost:3001/api/wallet/sync \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "created": 5,
  "updated": 2,
  "totalTokensProcessed": 7,
  "walletFailures": [],
  "assetErrors": []
}
```

**Status Codes:**
- `200` - Sync completed successfully
- `503` - Zerion API not configured or wallet addresses not connected
- `500` - Server error

#### 2. **GET /api/wallet/sync-status**
Returns list of all auto-synced assets and their current values.

**Response:**
```json
{
  "totalSyncedAssets": 7,
  "totalValue": 15234.50,
  "assets": [
    {
      "id": 1,
      "symbol": "ETH",
      "name": "Ethereum",
      "balance": 2.5,
      "valueUsd": 5234.50,
      "lastUpdated": "2025-03-11",
      "details": {
        "source": "wallet-auto-sync",
        "coingeckoId": "ethereum",
        "chainId": 1,
        "logo": "https://..."
      }
    }
  ]
}
```

### Frontend API Functions

#### 1. **triggerWalletSync()**
Triggers wallet sync and returns result.

```javascript
import { triggerWalletSync } from '../services/api.js'

const result = await triggerWalletSync()
console.log(`Created: ${result.created}, Updated: ${result.updated}`)
```

#### 2. **fetchWalletSyncStatus()**
Fetches current sync status and auto-synced assets.

```javascript
import { fetchWalletSyncStatus } from '../services/api.js'

const status = await fetchWalletSyncStatus()
console.log(`Total synced assets: ${status.totalSyncedAssets}`)
console.log(`Total value: $${status.totalValue}`)
```

## User Workflows

### Workflow 1: Auto-Sync During Onboarding

1. User reaches **Integrations** step (Step 16)
2. User enters wallet addresses (one per line)
3. User clicks "Save wallet addresses"
4. **System automatically:**
   - Validates addresses
   - Saves to `wallet_connections` table
   - Triggers `triggerWalletSync()` in background
   - Creates crypto assets from fetched portfolio
   - Shows success notification with count of assets created/updated

**User Experience:**
- Seamless, no extra clicks needed
- Addresses are saved first, sync happens asynchronously
- Non-blocking: if sync fails, wallet addresses are still saved

### Workflow 2: Manual Sync from Dashboard

1. User navigates to **Wealth Dashboard**
2. If wallets exist, "Sync Wallets" button appears
3. User clicks "Sync Wallets"
4. **System:**
   - Fetches fresh portfolio data from all connected wallets
   - Updates existing auto-synced assets with latest balances/values
   - Creates new assets if new tokens found
   - Shows notification with summary

**Use Cases:**
- After buying new tokens to import into portfolio
- Regular refresh to keep crypto holdings up-to-date
- Syncing multiple wallets periodically

## Technical Details

### Data Flow

```
Frontend: handleSaveWallets()
    ↓
saveWalletConnection() → POST /api/wallet/connections
    ↓
triggerWalletSync() → POST /api/wallet/sync
    ↓
Backend: performFullWalletSync()
    ├─ getUserWalletAddresses() → Query wallet_connections
    ├─ fetchUserWalletsPortfolio() → Zerion API calls
    └─ syncWalletTokensToAssets() → CREATE/UPDATE assets
    ↓
Assets tagged with: { source: 'wallet-auto-sync' }
```

### Asset Structure for Auto-Synced Crypto

```javascript
{
  id: 123,
  user_id: 456,
  name: "Ethereum",
  category: "Crypto",
  ticker: "ETH",
  quantity: 2.5,        // Token balance
  value: 5234.50,       // Current USD value
  cost: 0,              // Cost basis (set to 0, user can update)
  date: "2025-03-11",   // Sync date
  institution: "Auto-synced Wallet",
  details: {
    source: "wallet-auto-sync",
    coingeckoId: "ethereum",
    contractAddress: "0x...",
    chainId: 1,
    logo: "https://api.coingecko.com/...",
    lastSyncedAt: "2025-03-11T10:30:00Z"
  }
}
```

### Error Handling

**Graceful Degradation:**
- If Zerion API fails for one wallet: continue with others
- If sync fails entirely: wallet addresses still saved, user can retry manually
- Errors logged but non-blocking in onboarding flow

**Error Response:**
```json
{
  "success": false,
  "error": "Zerion not configured — use /api/wallet/balances instead",
  "message": "Ensure Zerion API is configured and wallet addresses are connected"
}
```

## Configuration Requirements

### Environment Variables

The feature requires **Zerion API key** to be configured:

```env
ZERION_API_KEY=your_zerion_api_key_here
```

**If not configured:**
- Sync endpoints return 503 Service Unavailable
- User can still save wallet addresses
- Manual wallet import via WalletPanel still works using Alchemy fallback

### Database

No schema changes required. Uses existing tables:
- `wallet_connections` - Stores wallet addresses (already exists)
- `assets` - Stores synced assets (already exists)

## Monitoring & Logging

All wallet sync operations are logged with `[WalletSync]` prefix:

```
[WalletSync] Fetching portfolio for 2 wallet(s): 0x123..., 0x456...
[WalletSync] 0x123...: Fetched 5 tokens
[WalletSync] Created ETH: balance=2.5, value=$5234.50
[WalletSync] Updated USDC: balance=1000, value=$1000
[WalletSync] Total tokens collected: 7, failures: 0
```

## Future Enhancements

1. **Scheduled Auto-Sync** - Periodic background syncing (hourly/daily)
2. **Sync Settings** - User control over sync frequency
3. **Cost Basis Tracking** - Import transaction history for accurate gains/losses
4. **Multi-Chain Support** - Sync across multiple blockchain networks simultaneously
5. **Webhook Notifications** - Alert user when significant portfolio changes detected
6. **Sync History** - Track when each wallet was last synced

## Troubleshooting

### Wallet addresses saved but no assets created

1. **Check Zerion API Configuration:**
   ```bash
   curl -H "Authorization: Basic $(echo -n 'API_KEY:' | base64)" \
     https://api.zerion.io/v1/wallets/0x123.../positions/
   ```

2. **Verify wallet addresses are valid EVM addresses:**
   - Must start with `0x`
   - Must be 42 characters total

3. **Check server logs for `[WalletSync]` messages**

### Assets not updating on manual sync

- Click "Refresh" button first to refresh prices
- Then click "Sync Wallets" to update portfolio balances
- Check if wallet has any holdings (sync skips wallets with $0 balance)

### Too many assets being created

- Check if same token exists across multiple wallets
- Service merges tokens by symbol, so should only create one asset per unique token

## Testing

### Manual Test Walkthrough

1. **Start servers:**
   ```bash
   npm run dev (in client)
   npm start (in server)
   ```

2. **Complete onboarding with wallets:**
   - Navigate to http://localhost:5173
   - Go through onboarding steps
   - At step 16 (Integrations), enter valid wallet address (or use Ethereum.org address)
   - Click "Save wallet addresses"
   - Observe console for sync logs

3. **Verify assets created:**
   - Check Dashboard - new crypto assets should appear
   - Check Assets page - should see auto-synced assets with `wallet-auto-sync` source

4. **Test manual sync:**
   - On Dashboard, click "Sync Wallets" button
   - Assets should update with latest balances

## API Dependencies

- **Zerion API** - Primary source for wallet portfolio data
  - Endpoint: `https://api.zerion.io/v1/wallets/{address}/positions/`
  - Requires API key configured in `.env`
  - Alternative: Falls back to Alchemy for basic token balances

## References

- [Zerion API Documentation](https://api.zerion.io/docs)
- [EVM Wallet Address Standard](https://ethereum.org/en/developers/docs/standards/tokens/erc-20/)
- [Asset Category Constants](../../shared/constants.js)
