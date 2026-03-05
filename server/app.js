import express from 'express'
import cors from 'cors'
import axios from 'axios'
import crypto from 'crypto'
import { SignJWT, importPKCS8 } from 'jose'
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import { createAssetsController } from './controllers/assetsController.js'
import { createAuthController } from './controllers/authController.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { getInsightsPayload } from './services/insightsService.js'

// ── Plaid client ──────────────────────────────────────────────
function makePlaidClient() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) return null
  const config = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
  return new PlaidApi(config)
}

// ── SGFinDex / MyInfo helpers ─────────────────────────────────
const MYINFO_BASE = process.env.MYINFO_ENV === 'prod'
  ? 'https://api.myinfo.gov.sg'
  : 'https://test.api.myinfo.gov.sg'

const MYINFO_ATTRS = 'name,sex,dob,birthcountry,residentialstatus,cpfbalances,cpfcontributions,bankaccounts,investmentsvested,noa-basic'

const pkceStore = new Map() // in-memory: state → { codeVerifier, userId }

async function makeMyInfoClientAssertion(appId, tokenUrl, privateKeyPem) {
  const key = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(appId)
    .setSubject(appId)
    .setAudience(tokenUrl)
    .setJti(crypto.randomUUID())
    .setExpirationTime('2m')
    .sign(key)
}

const ALCHEMY_NETWORKS = {
  1: 'eth-mainnet',
  137: 'polygon-mainnet',
  42161: 'arb-mainnet',
  56: 'bnb-mainnet',
}

async function alchemyRpc(network, method, params) {
  const key = process.env.ALCHEMY_API_KEY
  if (!key) throw new Error('ALCHEMY_API_KEY not configured')
  const url = `https://${network}.g.alchemy.com/v2/${key}`
  const { data } = await axios.post(url, { jsonrpc: '2.0', method, params, id: 1 })
  if (data.error) throw new Error(data.error.message)
  return data.result
}

export function createApp({
  pool,
  ensureFreshPrices,
  refreshUserPrices,
  getPortfolioSummary,
  getPortfolioHistory,
  recordNetWorthSnapshot,
  createUserAccount,
  authenticateAccount,
  getUserById,
  changePassword,
  deleteAccount,
  updateProfile,
}) {
  const app = express()
  const assetsController = createAssetsController({ pool, recordNetWorthSnapshot })
  const requireAuth = createAuthMiddleware({
    getUserById: (id) => getUserById(pool, id),
  })
  const authController = createAuthController({
    createUserAccount: (payload) => createUserAccount(pool, payload),
    authenticateAccount: (payload) => authenticateAccount(pool, payload),
    getUserById: (id) => getUserById(pool, id),
    changePassword: (id, payload) => changePassword(pool, id, payload),
    deleteAccount: (id, payload) => deleteAccount(pool, id, payload),
    updateProfile: (id, payload) => updateProfile(pool, id, payload),
  })

  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'safeseven-api' })
  })

  app.post('/api/auth/register', authController.register)
  app.post('/api/auth/login', authController.login)
  app.get('/api/auth/me', requireAuth, authController.me)
  app.put('/api/auth/profile', requireAuth, authController.updateProfile)
  app.put('/api/auth/password', requireAuth, authController.updatePassword)
  app.delete('/api/auth/account', requireAuth, authController.removeAccount)

  app.get('/api/assets', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      return assetsController.listAssets(req, res)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })
  app.post('/api/assets', requireAuth, assetsController.createAsset)
  app.put('/api/assets/:id', requireAuth, assetsController.updateAsset)
  app.delete('/api/assets/:id', requireAuth, assetsController.deleteAsset)

  app.get('/api/portfolio/summary', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const summary = await getPortfolioSummary(req.user.id)
      res.json(summary)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/portfolio/history', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const history = await getPortfolioHistory(req.user.id)
      res.json(history)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/insights', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const payload = await getInsightsPayload({
        pool,
        userId: req.user.id,
        getPortfolioSummary,
        query: req.query,
      })
      res.json(payload)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/prices/refresh', requireAuth, async (req, res) => {
    try {
      await refreshUserPrices(req.user.id, 'manual_refresh')
      res.json({ status: 'ok', refreshed: new Date().toISOString() })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/prices', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const { rows } = await pool.query(
        `SELECT DISTINCT pc.*
         FROM price_cache pc
         INNER JOIN assets a ON a.ticker = pc.symbol
         WHERE a.user_id = $1
         ORDER BY pc.updated_at DESC`,
        [req.user.id]
      )
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Plaid ─────────────────────────────────────────────────────
  const plaidClient = makePlaidClient()

  app.post('/api/plaid/link-token', requireAuth, async (req, res) => {
    if (!plaidClient) return res.status(503).json({ error: 'Plaid not configured' })
    try {
      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: String(req.user.id) },
        client_name: 'SafeSeven',
        products: [Products.Auth, Products.Investments],
        country_codes: [CountryCode.Us, CountryCode.Gb, CountryCode.Ca, CountryCode.Au],
        language: 'en',
      })
      res.json({ link_token: response.data.link_token })
    } catch (err) {
      res.status(500).json({ error: err.response?.data?.error_message || err.message })
    }
  })

  app.post('/api/plaid/exchange-token', requireAuth, async (req, res) => {
    if (!plaidClient) return res.status(503).json({ error: 'Plaid not configured' })
    const { public_token } = req.body
    try {
      const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
      const { access_token, item_id } = exchangeRes.data

      const itemRes = await plaidClient.itemGet({ access_token })
      const institutionId = itemRes.data.item.institution_id
      let institutionName = 'Bank'
      if (institutionId) {
        try {
          const instRes = await plaidClient.institutionsGetById({
            institution_id: institutionId,
            country_codes: [CountryCode.Us, CountryCode.Gb, CountryCode.Ca, CountryCode.Au],
          })
          institutionName = instRes.data.institution.name
        } catch { /* non-critical */ }
      }

      await pool.query(
        `INSERT INTO plaid_items (user_id, item_id, access_token, institution_id, institution_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, item_id) DO UPDATE
           SET access_token = EXCLUDED.access_token, institution_name = EXCLUDED.institution_name`,
        [req.user.id, item_id, access_token, institutionId, institutionName]
      )
      res.json({ success: true, institution_name: institutionName })
    } catch (err) {
      res.status(500).json({ error: err.response?.data?.error_message || err.message })
    }
  })

  app.get('/api/plaid/accounts', requireAuth, async (req, res) => {
    if (!plaidClient) return res.status(503).json({ error: 'Plaid not configured' })
    const { rows } = await pool.query(
      'SELECT id, item_id, access_token, institution_name FROM plaid_items WHERE user_id = $1',
      [req.user.id]
    )
    const results = await Promise.all(rows.map(async (item) => {
      try {
        const balRes = await plaidClient.accountsBalanceGet({ access_token: item.access_token })
        return {
          dbId: item.id,
          itemId: item.item_id,
          institution: item.institution_name,
          accounts: balRes.data.accounts.map(a => ({
            id: a.account_id,
            name: a.name,
            officialName: a.official_name,
            type: a.type,
            subtype: a.subtype,
            balance: a.balances.current,
            available: a.balances.available,
            currency: a.balances.iso_currency_code || 'USD',
            mask: a.mask,
          })),
        }
      } catch {
        return { dbId: item.id, itemId: item.item_id, institution: item.institution_name, accounts: [], error: true }
      }
    }))
    res.json(results)
  })

  app.delete('/api/plaid/items/:id', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      'SELECT access_token FROM plaid_items WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    if (plaidClient) {
      try { await plaidClient.itemRemove({ access_token: rows[0].access_token }) } catch { /* best effort */ }
    }
    await pool.query('DELETE FROM plaid_items WHERE id = $1', [req.params.id])
    res.status(204).end()
  })

  // ── SGFinDex / MyInfo ─────────────────────────────────────────
  app.get('/api/singpass/auth-url', requireAuth, async (req, res) => {
    const appId = process.env.MYINFO_APP_ID
    const redirectUri = process.env.MYINFO_REDIRECT_URI || 'http://localhost:3001/api/singpass/callback'
    if (!appId) return res.status(503).json({ error: 'MYINFO_APP_ID not configured' })

    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const state = crypto.randomBytes(16).toString('hex')

    pkceStore.set(state, { codeVerifier, userId: req.user.id })
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000) // expire in 10 min

    const params = new URLSearchParams({
      client_id: appId,
      scope: MYINFO_ATTRS,
      purpose_id: 'financial-wellness',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    })

    res.json({ authUrl: `${MYINFO_BASE}/com/v4/authorize?${params}` })
  })

  app.get('/api/singpass/callback', async (req, res) => {
    const { code, state } = req.query
    const session = pkceStore.get(state)
    if (!session) return res.status(400).send('Invalid or expired session state')
    pkceStore.delete(state)

    const { codeVerifier, userId } = session
    const appId = process.env.MYINFO_APP_ID
    const privateKeyPem = process.env.MYINFO_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const redirectUri = process.env.MYINFO_REDIRECT_URI || 'http://localhost:3001/api/singpass/callback'
    const tokenUrl = `${MYINFO_BASE}/com/v4/token`

    try {
      const clientAssertion = await makeMyInfoClientAssertion(appId, tokenUrl, privateKeyPem)
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: appId,
        code_verifier: codeVerifier,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      })
      const tokenRes = await axios.post(tokenUrl, tokenParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const accessToken = tokenRes.data.access_token

      // Decode sub from access token (JWT) to get UINFIN
      const [, payload] = accessToken.split('.')
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
      const sub = decoded.sub

      // Fetch person data
      const personRes = await axios.get(
        `${MYINFO_BASE}/com/v4/person/${sub}/?scope=${MYINFO_ATTRS}&client_id=${appId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      await pool.query(
        `INSERT INTO singpass_connections (user_id, myinfo_sub, data, fetched_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET myinfo_sub = EXCLUDED.myinfo_sub, data = EXCLUDED.data, fetched_at = NOW()`,
        [userId, sub, JSON.stringify(personRes.data)]
      )

      // Redirect back to client
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
      res.redirect(`${clientUrl}/assets?singpass=connected`)
    } catch (err) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
      res.redirect(`${clientUrl}/assets?singpass=error&msg=${encodeURIComponent(err.message)}`)
    }
  })

  app.get('/api/singpass/data', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      'SELECT myinfo_sub, data, fetched_at FROM singpass_connections WHERE user_id = $1',
      [req.user.id]
    )
    if (!rows.length) return res.json(null)

    const raw = rows[0].data
    // Parse and normalise CPF, bank accounts, investments
    const cpf = raw.cpfbalances || {}
    const banks = Array.isArray(raw.bankaccounts) ? raw.bankaccounts : []
    const investments = Array.isArray(raw.investmentsvested) ? raw.investmentsvested : []

    res.json({
      sub: rows[0].myinfo_sub,
      fetchedAt: rows[0].fetched_at,
      cpf: {
        oa: cpf.oa?.value ?? null,
        sa: cpf.sa?.value ?? null,
        ma: cpf.ma?.value ?? null,
        ra: cpf.ra?.value ?? null,
      },
      bankAccounts: banks.map(b => ({
        bankCode: b.bankcode?.value,
        bankName: b.bankname?.value,
        accountType: b.accounttype?.value,
        accountNum: b.accountnum?.value,
      })),
      investments: investments.map(i => ({
        type: i.investmenttypecode?.value,
        name: i.investmentname?.value,
        quantity: i.vested?.value,
        currency: i.currency?.value,
      })),
      name: raw.name?.value,
    })
  })

  app.delete('/api/singpass/disconnect', requireAuth, async (req, res) => {
    await pool.query('DELETE FROM singpass_connections WHERE user_id = $1', [req.user.id])
    res.status(204).end()
  })

  // ── Wallet connections ────────────────────────────────────────
  app.get('/api/wallet/connections', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, address, chain_id, label, connected_at FROM wallet_connections WHERE user_id = $1 ORDER BY connected_at DESC',
        [req.user.id]
      )
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/wallet/connections', requireAuth, async (req, res) => {
    const { address, chainId = 1, label } = req.body
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' })
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO wallet_connections (user_id, address, chain_id, label)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, address, chain_id) DO UPDATE SET label = EXCLUDED.label
         RETURNING id, address, chain_id, label, connected_at`,
        [req.user.id, address.toLowerCase(), chainId, label || null]
      )
      res.status(201).json(rows[0])
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete('/api/wallet/connections/:id', requireAuth, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM wallet_connections WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      )
      res.status(204).end()
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Fetch on-chain balances via Alchemy
  app.get('/api/wallet/balances', requireAuth, async (req, res) => {
    const { address, chainId = '1' } = req.query
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' })
    }
    const network = ALCHEMY_NETWORKS[parseInt(chainId)] || 'eth-mainnet'
    const nativeSymbol = chainId === '137' ? 'MATIC' : chainId === '56' ? 'BNB' : 'ETH'

    try {
      // Native balance
      const hexBalance = await alchemyRpc(network, 'eth_getBalance', [address, 'latest'])
      const nativeBalance = Number(BigInt(hexBalance)) / 1e18

      // ERC-20 token balances
      const tokenResult = await alchemyRpc(network, 'alchemy_getTokenBalances', [address, 'erc20'])
      const nonZero = (tokenResult?.tokenBalances || []).filter(
        t => t.tokenBalance && t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000'
      ).slice(0, 25)

      // Fetch metadata for each token in parallel
      const tokens = await Promise.all(
        nonZero.map(async (t) => {
          try {
            const meta = await alchemyRpc(network, 'alchemy_getTokenMetadata', [t.contractAddress])
            const decimals = meta?.decimals ?? 18
            const balance = Number(BigInt(t.tokenBalance)) / Math.pow(10, decimals)
            if (balance < 0.0001) return null
            return {
              contractAddress: t.contractAddress,
              symbol: meta?.symbol || '???',
              name: meta?.name || t.contractAddress.slice(0, 8),
              logo: meta?.logo || null,
              balance,
              decimals,
            }
          } catch {
            return null
          }
        })
      )

      res.json({
        address,
        chainId: parseInt(chainId),
        native: { symbol: nativeSymbol, balance: nativeBalance },
        tokens: tokens.filter(Boolean),
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return app
}
