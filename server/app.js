import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
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
    pool,
  })
  const authController = createAuthController({
    pool,
    createUserAccount: (payload) => createUserAccount(pool, payload),
    authenticateAccount: (payload) => authenticateAccount(pool, payload),
    getUserById: (id) => getUserById(pool, id),
    changePassword: (id, payload) => changePassword(pool, id, payload),
    deleteAccount: (id, payload) => deleteAccount(pool, id, payload),
    updateProfile: (id, payload) => updateProfile(pool, id, payload),
  })

  // ── Security headers (Helmet) ── industry standard for fintech ──
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'deny' },
  }))

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))

  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' })) // prevent large payload attacks

  // ── Rate limiting ─────────────────────────────────────────────
  // Auth endpoints: strict (10 attempts / 15 min) — brute-force protection
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait 15 minutes before trying again.' },
  })

  // General API: relaxed (300 req / min)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  })

  app.use('/api/', apiLimiter)

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'safeseven-api' })
  })

  app.post('/api/auth/register', authLimiter, authController.register)
  app.post('/api/auth/login', authLimiter, authController.login)
  app.post('/api/auth/logout', requireAuth, authController.logout)
  app.get('/api/auth/me', requireAuth, authController.me)
  app.put('/api/auth/profile', requireAuth, authController.updateProfile)
  app.put('/api/auth/password', requireAuth, authController.updatePassword)
  app.delete('/api/auth/account', requireAuth, authController.removeAccount)

  app.get('/api/assets', requireAuth, (req, res) => {
    // Fire-and-forget: refresh prices in background so the response
    // is not blocked by slow external calls (Yahoo Finance / CoinGecko).
    ensureFreshPrices(req.user.id).catch(() => {})
    return assetsController.listAssets(req, res)
  })
  app.post('/api/assets', requireAuth, assetsController.createAsset)
  app.put('/api/assets/:id', requireAuth, assetsController.updateAsset)
  app.delete('/api/assets/:id', requireAuth, assetsController.deleteAsset)

  app.get('/api/portfolio/summary', requireAuth, async (req, res) => {
    try {
      ensureFreshPrices(req.user.id).catch(() => {})
      const summary = await getPortfolioSummary(req.user.id)
      res.json(summary)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/portfolio/history', requireAuth, async (req, res) => {
    try {
      ensureFreshPrices(req.user.id).catch(() => {})
      const history = await getPortfolioHistory(req.user.id)
      res.json(history)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── AI Chat ────────────────────────────────────────────────
  app.post('/api/chat', requireAuth, async (req, res) => {
    try {
      const { messages = [], portfolioContext = null } = req.body
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' })
      }
      // Sanitize: enforce types, cap message length, limit history depth
      const MAX_MSG_LEN = 2000
      const safeMessages = messages.slice(-20).map(m => ({
        role: ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user',
        content: String(m.content || '').slice(0, MAX_MSG_LEN),
      }))
      const apiKey = process.env.FEATHERLESS_API_KEY
      if (!apiKey) return res.status(503).json({ error: 'AI service not configured' })

      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({ baseURL: 'https://api.featherless.ai/v1', apiKey })

      // Guard: reject clearly off-topic messages before hitting the model
      const lastUserMsg = [...safeMessages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || ''
      const offTopicPatterns = [
        /\b(recipe|cook|sport|weather|movie|music|game|dating|travel|holiday|joke|poem|song|code|programming|hack|politic|religion|celebrity|gossip)\b/,
      ]
      if (offTopicPatterns.some(p => p.test(lastUserMsg)) && !/\b(portfolio|invest|stock|fund|cpf|asset|wealth|money|finance|saving|budget|debt|return|dividend|crypto|sgd|market|risk|retire)\b/.test(lastUserMsg)) {
        return res.json({ reply: "I'm WealthAI — I'm only able to help with personal finance, investing, and wealth wellness topics. Try asking me about your portfolio, savings strategy, CPF, or how to improve your wellness score." })
      }

      const systemMessages = [
        {
          role: 'system',
          content: `You are WealthAI, a specialist personal finance and wealth wellness advisor embedded in SafeSeven — a Singapore-focused wealth management app built for NTU FinTech Hackathon 2026 (Schroders Wealth Wellness Hub).

SCOPE — You ONLY discuss topics within this list. Politely refuse anything outside it:
• Portfolio analysis and asset allocation
• Investment principles (stocks, ETFs, bonds, REITs, crypto, commodities, property)
• Singapore-specific finance: CPF (OA/SA/MA/RA), SRS, SGX, MAS regulations, SSBs, T-bills
• Wealth wellness scoring: diversification, liquidity, emergency funds, debt management
• Personal budgeting, savings rate, net worth tracking
• Retirement and financial independence planning
• Risk management and insurance (general principles only)
• Interpreting the user's SafeSeven portfolio data

HARD RULES:
1. If the user asks about anything outside the scope above (politics, entertainment, coding, recipes, sports, personal relationships, etc.), respond ONLY with: "I'm focused on financial wellness topics. Ask me about your portfolio, investments, CPF, or wealth strategy instead."
2. Never give specific "buy/sell [ticker]" instructions — give principles and frameworks instead.
3. Never fabricate numbers, rates, or regulatory facts. If uncertain, say so and recommend official sources (MAS, CPF Board, SGX).
4. Always ground advice in the user's portfolio data when it is provided.
5. Keep responses concise and scannable — use bullet points for action steps.
6. Use Singapore context by default (SGD, CPF, MAS guidelines) but handle global assets when relevant.
7. Add a brief disclaimer when giving any investment-related guidance: "(Not financial advice — consult a licensed advisor for personalised recommendations.)"`,
        },
      ]

      if (portfolioContext) {
        systemMessages.push({ role: 'system', content: `User's current portfolio context (use this to personalise all advice):\n${portfolioContext}` })
      }

      const completion = await openai.chat.completions.create({
        model: 'perplexity-ai/r1-1776-distill-llama-70b',
        messages: [...systemMessages, ...safeMessages],
        max_tokens: 700,
        temperature: 0.4,
      })

      res.json({ reply: completion.choices[0].message.content })
    } catch (err) {
      res.status(500).json({ error: err.message || 'AI request failed' })
    }
  })

  app.get('/api/insights', requireAuth, async (req, res) => {
    try {
      ensureFreshPrices(req.user.id).catch(() => {})
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
      ensureFreshPrices(req.user.id).catch(() => {})
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

  // ── OCBC Open API (OAuth 2.0 Client Credentials) ──────────────
  // No redirect URL needed — server exchanges client_id + client_secret directly.
  const OCBC_TOKEN_URL = process.env.OCBC_TOKEN_URL || 'https://api.ocbc.com/token'
  const OCBC_API_BASE  = process.env.OCBC_API_BASE  || 'https://api.ocbc.com'

  async function getOcbcToken() {
    const clientId     = process.env.OCBC_CLIENT_ID
    const clientSecret = process.env.OCBC_CLIENT_SECRET
    if (!clientId || !clientSecret) throw new Error('OCBC_CLIENT_ID / OCBC_CLIENT_SECRET not set in .env')

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenRes = await axios.post(
      OCBC_TOKEN_URL,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        timeout: 15000,
      }
    )
    return tokenRes.data // { access_token, expires_in, token_type, ... }
  }

  // Connect: fetch a client-credentials token and store it
  app.post('/api/ocbc/connect', requireAuth, async (req, res) => {
    try {
      const tokenData = await getOcbcToken()
      const { access_token, expires_in } = tokenData
      const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000)

      const { encrypt } = await import('./services/encryptionService.js')
      await pool.query(
        `INSERT INTO ocbc_connections (user_id, access_token, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET access_token = EXCLUDED.access_token,
               expires_at   = EXCLUDED.expires_at,
               connected_at = NOW()`,
        [req.user.id, encrypt(access_token), expiresAt]
      )
      res.json({ connected: true, expiresAt })
    } catch (err) {
      console.error('[OCBC connect]', err.response?.data || err.message)
      const detail = err.response?.data?.error_description || err.response?.data?.message || err.message
      res.status(err.response?.status || 502).json({ error: `OCBC token request failed: ${detail}` })
    }
  })

  app.get('/api/ocbc/accounts', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT access_token, expires_at FROM ocbc_connections WHERE user_id = $1',
        [req.user.id]
      )
      if (!rows.length) return res.status(404).json({ error: 'No OCBC connection. Connect first.' })

      const { decrypt } = await import('./services/encryptionService.js')
      let accessToken = decrypt(rows[0].access_token)

      // Auto-refresh if token has expired
      if (rows[0].expires_at && new Date(rows[0].expires_at) < new Date()) {
        const tokenData = await getOcbcToken()
        accessToken = tokenData.access_token
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
        const { encrypt } = await import('./services/encryptionService.js')
        await pool.query(
          'UPDATE ocbc_connections SET access_token = $1, expires_at = $2 WHERE user_id = $3',
          [encrypt(accessToken), expiresAt, req.user.id]
        )
      }

      // OCBC Account Information — path may vary; check your portal docs
      const accountsRes = await axios.get(`${OCBC_API_BASE}/v1/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        timeout: 15000,
      })
      res.json(accountsRes.data)
    } catch (err) {
      console.error('[OCBC accounts]', err.response?.data || err.message)
      res.status(err.response?.status || 500).json({ error: err.response?.data?.message || err.message })
    }
  })

  app.get('/api/ocbc/status', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      'SELECT connected_at, expires_at FROM ocbc_connections WHERE user_id = $1',
      [req.user.id]
    )
    res.json({ connected: rows.length > 0, connectedAt: rows[0]?.connected_at, expiresAt: rows[0]?.expires_at })
  })

  app.delete('/api/ocbc/connection', requireAuth, async (req, res) => {
    await pool.query('DELETE FROM ocbc_connections WHERE user_id = $1', [req.user.id])
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

  // ── Markets (public data, auth required to prevent abuse) ────
  const INDICES = [
    { ticker: '^GSPC',  label: 'S&P 500',   region: 'US' },
    { ticker: '^IXIC',  label: 'Nasdaq',     region: 'US' },
    { ticker: '^HSI',   label: 'HSI',        region: 'HK' },
    { ticker: '^N225',  label: 'Nikkei',     region: 'JP' },
    { ticker: '^FTSE',  label: 'FTSE 100',   region: 'GB' },
    { ticker: '^AXJO',  label: 'ASX 200',    region: 'AU' },
    { ticker: '^STI',   label: 'STI',        region: 'SG' },
    { ticker: '^DJI',   label: 'Dow Jones',  region: 'US' },
  ]
  const WATCHLIST_STOCKS = [
    { ticker: 'AAPL',  label: 'Apple',     sector: 'Tech' },
    { ticker: 'MSFT',  label: 'Microsoft', sector: 'Tech' },
    { ticker: 'NVDA',  label: 'NVIDIA',    sector: 'Tech' },
    { ticker: 'GOOGL', label: 'Alphabet',  sector: 'Tech' },
    { ticker: 'AMZN',  label: 'Amazon',    sector: 'Tech' },
    { ticker: 'TSLA',  label: 'Tesla',     sector: 'Auto' },
    { ticker: 'META',  label: 'Meta',      sector: 'Tech' },
    { ticker: 'ES3.SI',label: 'STI ETF',   sector: 'ETF'  },
  ]
  const CRYPTO_IDS = ['bitcoin','ethereum','solana','binancecoin','ripple','cardano','polkadot']
  const CRYPTO_MAP = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB', ripple: 'XRP', cardano: 'ADA', polkadot: 'DOT' }

  // Simple in-memory cache (TTL: 3 min for overview, 10 min for chart)
  const mktCache = new Map()
  function mktCached(key, ttlMs, fetcher) {
    const hit = mktCache.get(key)
    if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data)
    return fetcher().then(data => { mktCache.set(key, { data, ts: Date.now() }); return data })
  }

  async function yahooQuote(ticker) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
      const { data } = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } })
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta) return null
      const prev = meta.chartPreviousClose || meta.previousClose || 0
      const price = meta.regularMarketPrice || 0
      const change = price - prev
      const changePct = prev ? (change / prev) * 100 : 0
      return { price, prev, change, changePct, volume: meta.regularMarketVolume || 0, marketCap: meta.marketCap || null, currency: meta.currency || 'USD' }
    } catch { return null }
  }

  async function yahooHistory(ticker, range = '1mo', interval = '1d') {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`
    const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } })
    const result = data?.chart?.result?.[0]
    if (!result) return []
    const { timestamp, indicators } = result
    const quote = indicators?.quote?.[0]
    if (!timestamp || !quote) return []
    return timestamp.map((ts, i) => ({
      t: ts * 1000,
      o: quote.open?.[i] ?? null,
      h: quote.high?.[i] ?? null,
      l: quote.low?.[i] ?? null,
      c: quote.close?.[i] ?? null,
      v: quote.volume?.[i] ?? null,
    })).filter(p => p.c !== null)
  }

  app.get('/api/markets/overview', requireAuth, async (req, res) => {
    try {
      const data = await mktCached('overview', 3 * 60 * 1000, async () => {
        const [indicesRaw, cryptoRaw, stocksRaw] = await Promise.all([
          Promise.all(INDICES.map(async idx => {
            const q = await yahooQuote(idx.ticker)
            return q ? { ...idx, ...q } : { ...idx, price: 0, change: 0, changePct: 0 }
          })),
          (async () => {
            try {
              const ids = CRYPTO_IDS.join(',')
              const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, { timeout: 8000 })
              return CRYPTO_IDS.map(id => ({
                ticker: CRYPTO_MAP[id],
                label: id.charAt(0).toUpperCase() + id.slice(1),
                coinId: id,
                price: data[id]?.usd || 0,
                changePct: data[id]?.usd_24h_change || 0,
                change: 0,
                marketCap: data[id]?.usd_market_cap || null,
                volume: data[id]?.usd_24h_vol || null,
                currency: 'USD',
              }))
            } catch { return [] }
          })(),
          Promise.all(WATCHLIST_STOCKS.map(async s => {
            const q = await yahooQuote(s.ticker)
            return q ? { ...s, ...q } : { ...s, price: 0, change: 0, changePct: 0 }
          })),
        ])
        return { indices: indicesRaw, crypto: cryptoRaw, stocks: stocksRaw, updatedAt: new Date().toISOString() }
      })
      res.json(data)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/markets/chart/:ticker', requireAuth, async (req, res) => {
    const { ticker } = req.params
    const range = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'].includes(req.query.range) ? req.query.range : '1mo'
    const interval = range === '1d' ? '5m' : range === '5d' ? '15m' : '1d'
    const cacheKey = `chart:${ticker}:${range}`
    const ttl = range === '1d' ? 2 * 60 * 1000 : 10 * 60 * 1000
    try {
      const candles = await mktCached(cacheKey, ttl, () => yahooHistory(ticker, range, interval))
      res.json({ ticker, range, interval, candles })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/markets/quote/:ticker', requireAuth, async (req, res) => {
    const { ticker } = req.params
    try {
      const q = await mktCached(`quote:${ticker}`, 60 * 1000, () => yahooQuote(ticker))
      if (!q) return res.status(404).json({ error: 'Quote not found' })
      res.json({ ticker, ...q })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Coinbase CEX integration ──
  app.post('/api/cex/coinbase/balances', requireAuth, async (req, res) => {
    const { apiKey, apiSecret } = req.body
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API key and secret are required' })
    }
    try {
      const { fetchCoinbaseBalances } = await import('./services/cexService.js')
      const balances = await fetchCoinbaseBalances(apiKey, apiSecret)
      res.json({ balances, source: 'coinbase' })
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        return res.status(400).json({ error: 'Invalid Coinbase API key. Ensure read-only permissions are enabled.' })
      }
      console.error('[cex] Coinbase error:', err.response?.data || err.message)
      res.status(500).json({ error: err.response?.data?.message || err.message })
    }
  })

  app.get('/api/cex/demo/balances', requireAuth, async (_req, res) => {
    const { getDemoBalances } = await import('./services/cexService.js')
    res.json({ balances: getDemoBalances(), source: 'demo' })
  })

  // ── Zerion wallet portfolio (richer data, multi-chain) ──
  app.get('/api/wallet/portfolio', requireAuth, async (req, res) => {
    const { address } = req.query
    if (!address) return res.status(400).json({ error: 'address query param required' })
    try {
      const { fetchWalletPortfolio, isZerionConfigured } = await import('./services/zerionService.js')
      if (!isZerionConfigured()) return res.status(501).json({ error: 'ZERION_API_KEY not set' })
      const positions = await fetchWalletPortfolio(address)
      res.json({ positions, source: 'zerion' })
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })

  // Purge expired revoked tokens every hour — keeps the denylist table small
  setInterval(async () => {
    try {
      await pool.query('DELETE FROM revoked_tokens WHERE expires_at < NOW()')
    } catch (err) {
      console.error('[cleanup] Revoked token purge failed:', err.message)
    }
  }, 60 * 60 * 1000)

  return app
}
