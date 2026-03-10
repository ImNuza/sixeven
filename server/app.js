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
import { decrypt, decryptJSON, encrypt, encryptJSON } from './services/encryptionService.js'

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

// ── Property lookup cache (24-hour TTL) ────────────────────────
const propertyCache = new Map() // postcode → { data, timestamp }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getCachedProperty(postcode) {
  const cached = propertyCache.get(postcode)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Cache HIT] Postcode ${postcode}`)
    return cached.data
  }
  if (cached) propertyCache.delete(postcode) // Expired
  return null
}

function setCachedProperty(postcode, data) {
  propertyCache.set(postcode, { data, timestamp: Date.now() })
  console.log(`[Cache SET] Postcode ${postcode}`)
}

// ── Retry helper for rate-limited requests ─────────────────────
async function axiosWithRetry(config, maxRetries = 3, backoffMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios(config)
    } catch (err) {
      if (err.response?.status === 429 && attempt < maxRetries) {
        const waitTime = backoffMs * Math.pow(2, attempt - 1)
        console.warn(`[Rate Limited] Attempt ${attempt}/${maxRetries}, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      throw err
    }
  }
}

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

const DEMO_PROVIDER = Object.freeze({
  MOOMOO_SG: 'moomoo_sg',
  CRYPTO_WALLET: 'crypto_wallet',
})

const DEMO_IMPORT_TAG = Object.freeze({
  [DEMO_PROVIDER.MOOMOO_SG]: 'demo-moomoo-sg',
  [DEMO_PROVIDER.CRYPTO_WALLET]: 'demo-crypto-wallet',
})

const SUPPORTED_DEMO_PROVIDERS = new Set(Object.values(DEMO_PROVIDER))
const USD_SGD = 1.35
let aiRequestQueue = Promise.resolve()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isConcurrencyLimitError(error) {
  const status = Number(error?.status || error?.response?.status || 0)
  const message = String(error?.response?.data?.error?.message || error?.message || '').toLowerCase()
  return status === 429 && message.includes('concurrency')
}

function enqueueAiRequest(task) {
  const next = aiRequestQueue.then(task, task)
  aiRequestQueue = next.catch(() => {})
  return next
}

function parseStoredJson(raw, fallback = {}) {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return fallback
  }
}

function extractLangChainText(content) {
  if (typeof content === 'string') {
    const text = content.trim()
    return text || null
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part.text === 'string') return part.text
        return ''
      })
      .join('')
      .trim()
    return text || null
  }

  return null
}

function normalizeSelectedDemoProviders(input = []) {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set()
  const selected = []
  for (const value of input) {
    const provider = String(value || '').trim().toLowerCase()
    if (!SUPPORTED_DEMO_PROVIDERS.has(provider) || seen.has(provider)) {
      continue
    }
    selected.push(provider)
    seen.add(provider)
  }
  return selected
}

function providerAssetKey(asset) {
  const ticker = String(asset.ticker || '').trim().toUpperCase()
  const name = String(asset.name || '').trim().toLowerCase()
  if (ticker) return `ticker:${ticker}`
  return `name:${name}`
}

async function listUserAssetsForImport(pool, userId) {
  const { rows } = await pool.query(
    'SELECT id, name, category, ticker, quantity, value, cost, date, institution, details FROM assets WHERE user_id = $1',
    [userId]
  )
  return rows.map((row) => ({
    ...row,
    institution: decrypt(row.institution),
    details: decryptJSON(row.details),
  }))
}

async function removeImportedAssetsForTag(pool, userId, importedFrom) {
  const assets = await listUserAssetsForImport(pool, userId)
  const ids = assets
    .filter((asset) => asset.details?.importedFrom === importedFrom)
    .map((asset) => asset.id)

  for (const id of ids) {
    await pool.query('DELETE FROM assets WHERE id = $1 AND user_id = $2', [id, userId])
  }
}

async function upsertImportedAssets(pool, userId, importedFrom, desiredAssets) {
  const existing = await listUserAssetsForImport(pool, userId)
  const existingByKey = new Map(
    existing
      .filter((asset) => asset.details?.importedFrom === importedFrom)
      .map((asset) => [providerAssetKey(asset), asset])
  )

  const desiredKeys = new Set()
  for (const asset of desiredAssets) {
    const key = providerAssetKey(asset)
    desiredKeys.add(key)
    const match = existingByKey.get(key)
    const safeInstitution = encrypt(asset.institution || null)
    const safeDetails = encryptJSON(asset.details || {})

    if (match) {
      await pool.query(
        `UPDATE assets
         SET name = $1, category = $2, ticker = $3, quantity = $4, value = $5, cost = $6, date = $7, institution = $8, details = $9
         WHERE id = $10 AND user_id = $11`,
        [
          asset.name,
          asset.category,
          asset.ticker || null,
          asset.quantity == null ? null : Number(asset.quantity),
          Number(asset.value || 0),
          Number(asset.cost || 0),
          asset.date,
          safeInstitution,
          JSON.stringify(safeDetails),
          match.id,
          userId,
        ]
      )
      continue
    }

    await pool.query(
      `INSERT INTO assets (user_id, name, category, ticker, quantity, value, cost, date, institution, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        asset.name,
        asset.category,
        asset.ticker || null,
        asset.quantity == null ? null : Number(asset.quantity),
        Number(asset.value || 0),
        Number(asset.cost || 0),
        asset.date,
        safeInstitution,
        JSON.stringify(safeDetails),
      ]
    )
  }

  for (const [key, asset] of existingByKey.entries()) {
    if (desiredKeys.has(key)) continue
    await pool.query('DELETE FROM assets WHERE id = $1 AND user_id = $2', [asset.id, userId])
  }
}

async function buildDemoMoomooAssets() {
  const { getDemoPositions } = await import('./services/moomooService.js')
  const data = getDemoPositions()
  const today = new Date().toISOString().slice(0, 10)
  return (data.positions || []).map((position) => {
    const isSgd = String(position.currency || '').toUpperCase() === 'SGD'
    const rate = isSgd ? 1 : USD_SGD
    const value = Math.round(Number(position.marketValue || 0) * rate * 100) / 100
    const cost = position.avgCost > 0
      ? Math.round(Number(position.avgCost || 0) * Number(position.quantity || 0) * rate * 100) / 100
      : value

    return {
      name: position.name || position.ticker || 'Demo Position',
      category: 'STOCKS',
      ticker: position.ticker || null,
      quantity: Number(position.quantity || 0),
      value,
      cost,
      date: today,
      institution: 'moomoo SG (Demo)',
      details: {
        importedFrom: DEMO_IMPORT_TAG[DEMO_PROVIDER.MOOMOO_SG],
        source: 'onboarding-demo',
        accountId: data.accountId || null,
        currency: position.currency || null,
        originalCode: position.code || null,
      },
    }
  })
}

async function buildDemoCryptoWalletAssets() {
  const { getDemoBalances } = await import('./services/cexService.js')
  const today = new Date().toISOString().slice(0, 10)
  return getDemoBalances().map((token) => {
    const value = Math.round(Number(token.nativeValue || 0) * USD_SGD * 100) / 100
    return {
      name: token.name || token.symbol || 'Demo Crypto',
      category: 'CRYPTO',
      ticker: token.coingeckoId || String(token.symbol || '').toLowerCase(),
      quantity: Number(token.balance || 0),
      value,
      cost: value,
      date: today,
      institution: 'Crypto Wallet (Demo)',
      details: {
        importedFrom: DEMO_IMPORT_TAG[DEMO_PROVIDER.CRYPTO_WALLET],
        source: 'onboarding-demo',
        symbol: token.symbol || null,
      },
    }
  })
}

async function syncDemoProviderAssets(pool, userId, selectedProviders) {
  if (selectedProviders.includes(DEMO_PROVIDER.MOOMOO_SG)) {
    await upsertImportedAssets(
      pool,
      userId,
      DEMO_IMPORT_TAG[DEMO_PROVIDER.MOOMOO_SG],
      await buildDemoMoomooAssets()
    )
  } else {
    await removeImportedAssetsForTag(pool, userId, DEMO_IMPORT_TAG[DEMO_PROVIDER.MOOMOO_SG])
  }

  if (selectedProviders.includes(DEMO_PROVIDER.CRYPTO_WALLET)) {
    await upsertImportedAssets(
      pool,
      userId,
      DEMO_IMPORT_TAG[DEMO_PROVIDER.CRYPTO_WALLET],
      await buildDemoCryptoWalletAssets()
    )
  } else {
    await removeImportedAssetsForTag(pool, userId, DEMO_IMPORT_TAG[DEMO_PROVIDER.CRYPTO_WALLET])
  }
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
    origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://127.0.0.1:5173'],
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

  app.get('/api/dashboard', requireAuth, async (req, res) => {
    try {
      // Run freshness check once for the whole dashboard payload instead of once per widget endpoint.
      ensureFreshPrices(req.user.id).catch(() => {})

      const [assetResult, summary, history, pricesResult] = await Promise.all([
        pool.query(
          `SELECT *
           FROM assets
           WHERE user_id = $1
           ORDER BY value DESC, name ASC`,
          [req.user.id]
        ),
        getPortfolioSummary(req.user.id),
        getPortfolioHistory(req.user.id),
        pool.query(
          `SELECT DISTINCT pc.*
           FROM price_cache pc
           INNER JOIN assets a ON a.ticker = pc.symbol
           WHERE a.user_id = $1
           ORDER BY pc.updated_at DESC`,
          [req.user.id]
        ),
      ])

      const assets = assetResult.rows.map((row) => ({
        ...row,
        institution: decrypt(row.institution),
        details: decryptJSON(row.details),
      }))

      res.json({
        assets,
        summary,
        history,
        prices: pricesResult.rows,
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

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
      const apiKey = process.env.AI_PROVIDER_API_KEY || process.env.FEATHERLESS_API_KEY
      const baseURL = process.env.AI_PROVIDER_BASE_URL || process.env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1'
      const model = process.env.AI_MODEL || process.env.FEATHERLESS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
      const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 30000)
      const maxRetries = Math.max(0, Number(process.env.AI_CONCURRENCY_RETRIES || 3))
      const retryBaseMs = Math.max(300, Number(process.env.AI_CONCURRENCY_RETRY_BASE_MS || 1500))
      const fallbackModels = String(
        process.env.AI_MODEL_FALLBACKS
        || process.env.FEATHERLESS_MODEL_FALLBACKS
        || 'Qwen/Qwen2.5-32B-Instruct,Qwen/Qwen2.5-14B-Instruct,perplexity-ai/r1-1776-distill-llama-70b'
      )
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      if (!apiKey || !baseURL || !model) {
        return res.status(503).json({
          error: 'AI service not configured. Set AI_PROVIDER_API_KEY, AI_PROVIDER_BASE_URL, and AI_MODEL.',
        })
      }

      const { ChatOpenAI } = await import('@langchain/openai')

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

      const modelCandidates = [model, ...fallbackModels.filter((candidate) => candidate !== model)]
      let reply = null
      let lastModelError = null

      for (const candidateModel of modelCandidates) {
        const llm = new ChatOpenAI({
          apiKey,
          model: candidateModel,
          temperature: 0.4,
          maxTokens: 700,
          configuration: {
            baseURL,
            timeout: timeoutMs,
          },
        })

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            const aiMessage = await enqueueAiRequest(() => llm.invoke(
              [...systemMessages, ...safeMessages].map((message) => {
                if (message.role === 'system') return ['system', message.content]
                if (message.role === 'assistant') return ['ai', message.content]
                return ['human', message.content]
              })
            ))
            reply = extractLangChainText(aiMessage?.content)
            break
          } catch (candidateError) {
            lastModelError = candidateError
            if (!isConcurrencyLimitError(candidateError) || attempt >= maxRetries) {
              break
            }
            const backoff = retryBaseMs * (attempt + 1)
            await sleep(backoff)
          }
        }
        if (reply) {
          break
        }
      }

      if (!reply) {
        throw lastModelError || new Error('AI provider request failed for all configured models.')
      }

      res.json({ reply })
    } catch (err) {
      const status = Number(err?.status || err?.response?.status || 500)
      const message = err?.response?.data?.error?.message || err?.message || 'AI request failed'
      if (status === 401 || status === 403) {
        return res.status(502).json({ error: 'AI provider rejected the request. Check API key and model access.' })
      }
      if (status === 429) {
        return res.status(429).json({ error: 'AI provider rate limit reached. Please retry shortly.' })
      }
      if (status >= 400 && status < 500) {
        return res.status(400).json({ error: `AI request invalid: ${message}` })
      }
      res.status(502).json({ error: `AI provider request failed: ${message}` })
    }
  })

  app.get('/api/onboarding/demo-links', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT provider, enabled, metadata, connected_at, updated_at
         FROM linked_demo_accounts
         WHERE user_id = $1
         ORDER BY provider ASC`,
        [req.user.id]
      )

      res.json({
        providers: rows.map((row) => ({
          provider: row.provider,
          enabled: Boolean(row.enabled),
          metadata: parseStoredJson(row.metadata, {}),
          connectedAt: row.connected_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to load demo links.' })
    }
  })

  app.post('/api/onboarding/demo-links', requireAuth, async (req, res) => {
    const selectedProviders = normalizeSelectedDemoProviders(req.body?.selectedProviders)
    const selectedSet = new Set(selectedProviders)
    const metadataByProvider = parseStoredJson(req.body?.metadataByProvider, {})
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      const { rows: existing } = await client.query(
        'SELECT provider FROM linked_demo_accounts WHERE user_id = $1',
        [req.user.id]
      )
      const existingSet = new Set(existing.map((row) => row.provider))

      for (const provider of SUPPORTED_DEMO_PROVIDERS) {
        const enabled = selectedSet.has(provider) ? 1 : 0
        const metadata = parseStoredJson(metadataByProvider?.[provider], {})

        if (existingSet.has(provider)) {
          await client.query(
            `UPDATE linked_demo_accounts
             SET enabled = $1, metadata = $2, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $3 AND provider = $4`,
            [enabled, JSON.stringify(metadata), req.user.id, provider]
          )
          continue
        }

        await client.query(
          `INSERT INTO linked_demo_accounts (user_id, provider, enabled, metadata)
           VALUES ($1, $2, $3, $4)`,
          [req.user.id, provider, enabled, JSON.stringify(metadata)]
        )
      }

      await syncDemoProviderAssets(client, req.user.id, selectedProviders)
      await recordNetWorthSnapshot(req.user.id, 'onboarding_demo_sync', client)
      await client.query('COMMIT')

      const { rows } = await client.query(
        `SELECT provider, enabled, metadata, connected_at, updated_at
         FROM linked_demo_accounts
         WHERE user_id = $1
         ORDER BY provider ASC`,
        [req.user.id]
      )

      res.json({
        selectedProviders,
        providers: rows.map((row) => ({
          provider: row.provider,
          enabled: Boolean(row.enabled),
          metadata: parseStoredJson(row.metadata, {}),
          connectedAt: row.connected_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch (err) {
      await client.query('ROLLBACK')
      res.status(500).json({ error: err.message || 'Failed to save onboarding demo links.' })
    } finally {
      client.release()
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
    await pool.query('DELETE FROM plaid_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])
    res.status(204).end()
  })

  // ── OCBC Open API (OAuth 2.0 Client Credentials) ──────────────
  // No redirect URL needed — server exchanges client_id + client_secret directly.
  const OCBC_API_BASE  = process.env.OCBC_API_BASE  || 'https://api.ocbc.com'
  const OCBC_TOKEN_URL = process.env.OCBC_TOKEN_URL || `${OCBC_API_BASE}/token`

  function firstEnv(...keys) {
    for (const key of keys) {
      const value = process.env[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return ''
  }

  function getOcbcCredentials() {
    const clientId = firstEnv('OCBC_CLIENT_ID', 'OCBC_APP_ID', 'OCBC_API_KEY')
    const clientSecret = firstEnv('OCBC_CLIENT_SECRET', 'OCBC_SECRET', 'OCBC_API_SECRET')
    return { clientId, clientSecret }
  }

  function getMyInfoConfig() {
    const appId = firstEnv('MYINFO_APP_ID', 'SINGPASS_APP_ID', 'SINGPASS_CLIENT_ID')
    const privateKey = firstEnv('MYINFO_PRIVATE_KEY', 'SINGPASS_PRIVATE_KEY').replace(/\\r/g, '').replace(/\\n/g, '\n')
    const redirectUri = firstEnv('MYINFO_REDIRECT_URI', 'SINGPASS_REDIRECT_URI') || 'http://localhost:3001/api/singpass/callback'
    return { appId, privateKey, redirectUri }
  }

  async function getOcbcToken() {
    const { clientId, clientSecret } = getOcbcCredentials()
    if (!clientId || !clientSecret || clientId.includes('your_') || clientSecret.includes('your_')) {
      throw new Error('OCBC credentials are not configured. Set OCBC_CLIENT_ID and OCBC_CLIENT_SECRET in server/.env, then restart.')
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenUrls = [...new Set([OCBC_TOKEN_URL, `${OCBC_API_BASE}/oauth/token`, `${OCBC_API_BASE}/token`])]
    const attempts = []

    for (const tokenUrl of tokenUrls) {
      const requestModes = [
        {
          data: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        },
        {
          data: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ]

      for (const mode of requestModes) {
        try {
          const tokenRes = await axios.post(tokenUrl, mode.data, {
            headers: mode.headers,
            timeout: 15000,
          })
          return tokenRes.data // { access_token, expires_in, token_type, ... }
        } catch (error) {
          attempts.push(`${tokenUrl} -> ${error.response?.status || error.code || error.message}`)
        }
      }
    }

    throw new Error(`OCBC token request failed. Verify credentials, OCBC_TOKEN_URL, and network access. Attempts: ${attempts.join(' | ')}`)
  }

  // Connect: fetch a client-credentials token and store it
  app.post('/api/ocbc/connect', requireAuth, async (req, res) => {
    try {
      const tokenData = await getOcbcToken()
      const { access_token, expires_in } = tokenData
      const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString()

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
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()
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
    const { appId, redirectUri } = getMyInfoConfig()
    if (!appId) {
      return res.status(503).json({ error: 'MYINFO_APP_ID not configured. Set MYINFO_APP_ID (or SINGPASS_APP_ID) in server/.env and restart.' })
    }

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
    const { appId, privateKey: privateKeyPem, redirectUri } = getMyInfoConfig()
    const tokenUrl = `${MYINFO_BASE}/com/v4/token`
    if (!appId || !privateKeyPem) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
      return res.redirect(`${clientUrl}/assets?singpass=error&msg=${encodeURIComponent('MYINFO_APP_ID or MYINFO_PRIVATE_KEY not configured on server')}`)
    }

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

  app.get('/api/property/lookup', requireAuth, async (req, res) => {
    const postcode = String(req.query.postcode || '').trim()
    if (!/^\d{6}$/.test(postcode)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit Singapore postcode.' })
    }

    // Check cache first
    const cachedData = getCachedProperty(postcode)
    if (cachedData) {
      return res.json(cachedData)
    }

    try {
      const oneMapRes = await axios.get('https://www.onemap.gov.sg/api/common/elastic/search', {
        params: {
          searchVal: postcode,
          returnGeom: 'N',
          getAddrDetails: 'Y',
          pageNum: 1,
        },
        timeout: 12000,
      })

      const result = oneMapRes.data?.results?.[0]
      if (!result) {
        return res.status(404).json({ error: 'No property was found for that postcode.' })
      }

      const block = String(result.BLK_NO || '').trim()
      const street = String(result.ROAD_NAME || '').trim().toUpperCase()
      let hdb = null
      let ura = null

      try {
        // Fetch HDB resale price data directly from data.gov.sg API (not CSV)
        // Using the REST API to query the datastore instead of downloading CSV
        
        // Try to fetch from the datastore_search API for resale flat prices
        // Resource ID for "Resale flat prices based on registration date from Jan 2017 onwards"
        const resourceIds = [
          'd_8b84c4c2458efd51642fb1f27835d5a1', // Jan 2017 onwards (main dataset)
          '1b702208-44bf-4829-b620-4615ee19b57f', // Alternative format
        ]
        
        let records = []
        for (const resourceId of resourceIds) {
          try {
            const apiRes = await axiosWithRetry({
              method: 'get',
              url: 'https://data.gov.sg/api/action/datastore_search',
              params: {
                resource_id: resourceId,
                filters: JSON.stringify({
                  block: [block],
                  street_name: [street]
                }),
                sort: 'month desc',
                limit: 100,
              },
              timeout: 15000,
            })
            records = apiRes.data?.result?.records || []
            if (records.length > 0) {
              console.log(`Found ${records.length} records from resource ${resourceId}`)
              break
            }
          } catch (err) {
            console.warn(`Resource ${resourceId} failed: ${err.message}`)
            continue
          }
        }
        
        // Fallback: Try fetching without exact filters if the strict query returned nothing
        if (records.length === 0) {
          try {
            const fallbackRes = await axiosWithRetry({
              method: 'get',
              url: 'https://data.gov.sg/api/action/datastore_search',
              params: {
                resource_id: 'd_8b84c4c2458efd51642fb1f27835d5a1',
                q: `${block} ${street}`,
                sort: 'month desc',
                limit: 100,
              },
              timeout: 15000,
            })
            records = fallbackRes.data?.result?.records || []
            console.log(`Fallback search found ${records.length} records`)
          } catch (err) {
            console.warn(`Fallback search failed: ${err.message}`)
          }
        }

        // Fetch HDB Price Index for trend validation
        let priceIndex = null
        try {
          const indexRes = await axiosWithRetry({
            method: 'get',
            url: 'https://data.gov.sg/api/action/datastore_search',
            params: {
              resource_id: 'd_14f63e595975691e7c24a27ae4c07c79',
              limit: 20,
              sort: 'quarter desc'
            },
            timeout: 10000,
          })
          const indexRecords = indexRes.data?.result?.records || []
          if (indexRecords.length > 0) {
            priceIndex = {
              records: indexRecords.slice(0, 4),
              latestQuarter: indexRecords[0]?.quarter || null,
              latestIndex: Number(indexRecords[0]?.index || 0) || null,
            }
            console.log(`HDB Price Index: latest=${priceIndex.latestQuarter}, index=${priceIndex.latestIndex}`)
          }
        } catch (indexErr) {
          console.warn('HDB price index fetch failed:', indexErr.message)
        }

        if (records.length > 0) {
          // Filter by room type to find comparable sales
          const comparableSales = records
            .filter(r => r.resale_price && Number(r.resale_price) > 0)
            .slice(0, 10)
            .map(r => ({
              month: r.month || null,
              resalePrice: Number(r.resale_price) || null,
              flatType: r.flat_type || null,
              storey: r.storey_range || null,
            }))

          if (comparableSales.length > 0) {
            const latest = records[0]
            hdb = {
              latestMonth: latest.month || null,
              latestResalePrice: Number(latest.resale_price) || null,
              flatType: latest.flat_type || null,
              flatModel: latest.flat_model || null,
              floorAreaSqm: Number(latest.floor_area_sqm) || null,
              comparableSales: comparableSales,
              priceIndex: priceIndex,
            }
            console.log(`HDB data: latestPrice=${hdb.latestResalePrice}, comparableSales=${comparableSales.length}, flatTypes=[${comparableSales.map(s => s.flatType).join(', ')}]`)
          }
        } else {
          console.log(`No HDB records found for block=${block}, street=${street}`)
        }
      } catch (err) {
        console.error('HDB lookup error:', err.message)
        hdb = null
      }

      // URA lookup disabled for now (too slow) - ura remains null

      const responseData = {
        postcode,
        address: [result.BLK_NO, result.ROAD_NAME, result.BUILDING].filter(Boolean).join(' '),
        block: result.BLK_NO || null,
        street: result.ROAD_NAME || null,
        building: result.BUILDING || null,
        latitude: result.LATITUDE || null,
        longitude: result.LONGITUDE || null,
        town: result.PLANNING_AREA || null,
        hdb,
        ura,
      }

      // Cache the response before returning
      setCachedProperty(postcode, responseData)
      res.json(responseData)
    } catch (err) {
      console.error('Property lookup error:', err.message)
      res.status(502).json({ error: err.message || 'Property lookup failed.' })
    }
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

  // ── Zerion wallet portfolio (richer data, multi-chain, falls back to Alchemy) ──
  app.get('/api/wallet/portfolio', requireAuth, async (req, res) => {
    const { address } = req.query
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' })
    }
    try {
      const { isZerionConfigured, fetchWalletPortfolio } = await import('./services/zerionService.js')
      if (!isZerionConfigured()) {
        return res.status(503).json({ error: 'Zerion not configured — use /api/wallet/balances instead' })
      }
      const tokens = await fetchWalletPortfolio(address)
      res.json({ address, tokens, source: 'zerion' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Auto-sync wallet addresses to assets ──────────────────────
  // Fetches portfolio data from all connected wallets and creates/updates crypto assets
  app.post('/api/wallet/sync', requireAuth, async (req, res) => {
    try {
      const { performFullWalletSync } = await import('./services/walletSyncService.js')
      const result = await performFullWalletSync(pool, req.user.id, recordNetWorthSnapshot)
      
      if (!result.success) {
        return res.status(503).json({ 
          error: result.error || 'Wallet sync failed',
          message: 'Ensure Zerion API is configured and wallet addresses are connected'
        })
      }

      res.json({
        success: true,
        created: result.created,
        updated: result.updated,
        totalTokensProcessed: result.totalTokensProcessed,
        walletFailures: result.walletFailures || [],
        assetErrors: result.assetErrors || [],
      })
    } catch (err) {
      console.error('[WalletSync] Endpoint error:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ── Get wallet sync status ─────────────────────────────────────
  app.get('/api/wallet/sync-status', requireAuth, async (req, res) => {
    try {
      // Return list of auto-synced assets for the user
      const { rows } = await pool.query(
        `SELECT id, ticker, name, quantity, value, date, details
         FROM assets 
         WHERE user_id = $1 
         AND category = 'Crypto'
         AND json_extract(details, '$.source') = 'wallet-auto-sync'
         ORDER BY date DESC`,
        [req.user.id]
      )
      
      const syncedAssets = rows.map(row => ({
        id: row.id,
        symbol: row.ticker,
        name: row.name,
        balance: row.quantity,
        valueUsd: row.value,
        lastUpdated: row.date,
        details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      }))

      res.json({
        totalSyncedAssets: syncedAssets.length,
        totalValue: syncedAssets.reduce((sum, a) => sum + (a.valueUsd || 0), 0),
        assets: syncedAssets,
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Moomoo Singapore (Futu OpenAPI via OpenD) ─────────────────
  app.post('/api/moomoo/positions', requireAuth, async (req, res) => {
    const { openDUrl } = req.body
    try {
      const { fetchMoomooPositions } = await import('./services/moomooService.js')
      const result = await fetchMoomooPositions(openDUrl || 'http://127.0.0.1:33333')
      res.json({ ...result, source: 'moomoo' })
    } catch (err) {
      const status = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code) ? 503 : 500
      res.status(status).json({ error: err.message || 'Failed to connect to OpenD gateway' })
    }
  })

  app.get('/api/moomoo/demo/positions', requireAuth, async (_req, res) => {
    const { getDemoPositions } = await import('./services/moomooService.js')
    res.json({ ...getDemoPositions(), source: 'demo' })
  })

  // ── IBKR Client Portal Web API ────────────────────────────────
  // Proxies requests to the user's locally-running IBKR Client Portal Gateway.
  // The gateway handles IBKR authentication; we just forward the call server-side.
  app.post('/api/ibkr/positions', requireAuth, async (req, res) => {
    const { gatewayUrl } = req.body
    try {
      const { fetchIbkrPositions } = await import('./services/ibkrService.js')
      const result = await fetchIbkrPositions(gatewayUrl || 'https://localhost:5000')
      res.json({ ...result, source: 'ibkr' })
    } catch (err) {
      const status = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code) ? 503 : 500
      res.status(status).json({ error: err.message || 'Failed to connect to IBKR gateway' })
    }
  })

  app.get('/api/ibkr/demo/positions', requireAuth, async (_req, res) => {
    const { getDemoPositions } = await import('./services/ibkrService.js')
    res.json({ ...getDemoPositions(), source: 'demo' })
  })

  // ── Live price lookup (single symbol, no DB write) ───────────
  // Used by the Add Asset modal for real-time price fetching.
  app.get('/api/prices/lookup', requireAuth, async (req, res) => {
    const { symbol, type = 'stock' } = req.query
    if (!symbol) return res.status(400).json({ error: 'symbol required' })
    try {
      if (type === 'crypto') {
        const { SYMBOL_TO_COINGECKO_ID } = await import('../shared/constants.js')
        const upper = symbol.toUpperCase()
        const geckoId = SYMBOL_TO_COINGECKO_ID[upper] || symbol.toLowerCase()
        console.log(`[Crypto Lookup] ${upper} → ${geckoId}`)
        const { data } = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd,sgd`,
          { 
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          }
        )
        const coinData = data[geckoId]
        if (!coinData) return res.status(404).json({ error: 'Token not found on CoinGecko' })
        console.log(`[Crypto Lookup] ${upper}: USD ${coinData.usd}, SGD ${coinData.sgd}`)
        return res.json({ symbol: upper, geckoId, priceUsd: coinData.usd, priceSgd: coinData.sgd, type: 'crypto' })
      }

      const upper = symbol.toUpperCase()
      console.log(`[Stock Lookup] Fetching ${upper}...`)
      const { data } = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=1d`,
        { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
      )
      const result = data?.chart?.result?.[0]
      if (!result) {
        console.warn(`[Stock Lookup] ${upper}: No chart result`)
        return res.status(404).json({ error: 'Symbol not found' })
      }

      const price = result.meta?.regularMarketPrice
      const currency = result.meta?.currency || 'USD'
      const name = result.meta?.longName || result.meta?.shortName || upper
      console.log(`[Stock Lookup] ${upper}: ${currency} ${price}`)

      const fxResp = await axios.get(
        'https://query1.finance.yahoo.com/v8/finance/chart/USDSGD=X?interval=1d&range=1d',
        { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
      ).catch((err) => {
        console.warn('[FX Lookup] USD/SGD failed:', err.message)
        return null
      })
      const usdSgd = fxResp?.data?.chart?.result?.[0]?.meta?.regularMarketPrice || 1.35
      console.log(`[FX Lookup] USD/SGD: ${usdSgd}`)

      const isSgx = upper.endsWith('.SI')
      const priceSgd = isSgx ? price : price * usdSgd
      const priceUsd = isSgx ? price / usdSgd : price

      res.json({ symbol: upper, name, price, currency, priceUsd, priceSgd, usdSgd, type: 'stock' })
    } catch (err) {
      console.error(`[Price Lookup ${symbol}] ${err.message}`)
      if (err.response?.status) console.error('  Status:', err.response.status)
      if (err.code) console.error('  Code:', err.code)
      res.status(500).json({ error: err.message || 'Price lookup failed' })
    }
  })

  // ── SnapTrade brokerage portfolio aggregation ─────────────────
  // Register or retrieve the SnapTrade user record for the authenticated user.
  // Creates the record on SnapTrade's side and persists the userSecret locally.
  app.post('/api/snaptrade/register', requireAuth, async (req, res) => {
    try {
      const { isSnapTradeConfigured, registerUser } = await import('./services/snaptradeService.js')
      if (!isSnapTradeConfigured()) {
        return res.status(503).json({ error: 'SnapTrade not configured' })
      }

      // Check for an existing record
      const { rows: existing } = await pool.query(
        'SELECT snaptrade_user_id, user_secret FROM snaptrade_users WHERE user_id = $1',
        [req.user.id]
      )
      if (existing.length) {
        return res.json({ snapUserId: existing[0].snaptrade_user_id, registered: false })
      }

      const snapUserId = `user_${req.user.id}`
      const result = await registerUser(snapUserId)
      const userSecret = result.userSecret || result.user_secret || result

      await pool.query(
        `INSERT INTO snaptrade_users (user_id, snaptrade_user_id, user_secret)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [req.user.id, snapUserId, typeof userSecret === 'string' ? userSecret : JSON.stringify(userSecret)]
      )

      res.json({ snapUserId, registered: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Get a SnapTrade redirect URI so the user can connect their brokerage account.
  app.post('/api/snaptrade/login', requireAuth, async (req, res) => {
    try {
      const { isSnapTradeConfigured, getLoginUrl } = await import('./services/snaptradeService.js')
      if (!isSnapTradeConfigured()) {
        return res.status(503).json({ error: 'SnapTrade not configured' })
      }

      const { rows } = await pool.query(
        'SELECT snaptrade_user_id, user_secret FROM snaptrade_users WHERE user_id = $1',
        [req.user.id]
      )
      if (!rows.length) {
        return res.status(404).json({ error: 'SnapTrade user not registered. Call /api/snaptrade/register first.' })
      }

      const { snaptrade_user_id: snapUserId, user_secret: userSecret } = rows[0]
      const result = await getLoginUrl(snapUserId, userSecret)
      res.json({ redirectURI: result.redirectURI || result.redirect_uri || result })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Fetch all holdings across connected brokerage accounts.
  app.get('/api/snaptrade/holdings', requireAuth, async (req, res) => {
    try {
      const { isSnapTradeConfigured, getHoldings } = await import('./services/snaptradeService.js')
      if (!isSnapTradeConfigured()) {
        return res.status(503).json({ error: 'SnapTrade not configured' })
      }

      const { rows } = await pool.query(
        'SELECT snaptrade_user_id, user_secret FROM snaptrade_users WHERE user_id = $1',
        [req.user.id]
      )
      if (!rows.length) {
        return res.status(404).json({ error: 'SnapTrade user not registered.' })
      }

      const { snaptrade_user_id: snapUserId, user_secret: userSecret } = rows[0]
      const holdings = await getHoldings(snapUserId, userSecret)
      res.json({ holdings, source: 'snaptrade' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // List connected brokerage accounts.
  app.get('/api/snaptrade/accounts', requireAuth, async (req, res) => {
    try {
      const { isSnapTradeConfigured, getAccounts } = await import('./services/snaptradeService.js')
      if (!isSnapTradeConfigured()) {
        return res.status(503).json({ error: 'SnapTrade not configured' })
      }

      const { rows } = await pool.query(
        'SELECT snaptrade_user_id, user_secret FROM snaptrade_users WHERE user_id = $1',
        [req.user.id]
      )
      if (!rows.length) {
        return res.status(404).json({ error: 'SnapTrade user not registered.' })
      }

      const { snaptrade_user_id: snapUserId, user_secret: userSecret } = rows[0]
      const accounts = await getAccounts(snapUserId, userSecret)
      res.json({ accounts, source: 'snaptrade' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Delete SnapTrade user and remove local record.
  app.delete('/api/snaptrade/user', requireAuth, async (req, res) => {
    try {
      const { isSnapTradeConfigured, deleteUser } = await import('./services/snaptradeService.js')
      if (!isSnapTradeConfigured()) {
        return res.status(503).json({ error: 'SnapTrade not configured' })
      }

      const { rows } = await pool.query(
        'SELECT snaptrade_user_id, user_secret FROM snaptrade_users WHERE user_id = $1',
        [req.user.id]
      )
      if (!rows.length) {
        return res.status(204).end()
      }

      const { snaptrade_user_id: snapUserId, user_secret: userSecret } = rows[0]
      await deleteUser(snapUserId, userSecret)
      await pool.query('DELETE FROM snaptrade_users WHERE user_id = $1', [req.user.id])
      res.status(204).end()
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Demo holdings — no broker connection required.
  app.get('/api/snaptrade/demo/holdings', requireAuth, async (_req, res) => {
    const { getDemoHoldings } = await import('./services/snaptradeService.js')
    res.json({ holdings: getDemoHoldings(), source: 'demo' })
  })

  // ── UOB Open Banking ────────────────────────────────────────
  app.get('/api/uob/accounts', requireAuth, async (req, res) => {
    const UOB_DEMO = {
      accounts: [{
        accountNumber: '9013531494',
        accountType: 'D',
        accountName: 'UOB Current Account',
        currency: 'SGD',
        balance: 48250.00,
        availableBalance: 48250.00,
      }],
      source: 'demo',
    }

    const authToken = process.env.UOB_AUTH_TOKEN
    if (!authToken) return res.json(UOB_DEMO)

    try {
      const txRef = `SS-${Date.now()}-${req.user.id}`
      const payload = {
        transactionReference: txRef,
        accounts: [{
          accountNumber: process.env.UOB_ACCOUNT_NUMBER || '9013531494',
          accountType: process.env.UOB_ACCOUNT_TYPE || 'D',
          accountCurrency: 'SGD',
        }],
      }
      const { data } = await axios.post(
        `${process.env.UOB_API_BASE || 'https://sandbox.uobgroup.com/api/v1'}/accounts/summary`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'x-app-id': process.env.UOB_APP_ID || '',
            'x-api-key': process.env.UOB_API_KEY || '',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      )
      const accounts = data?.accounts || data?.data?.accounts || (Array.isArray(data) ? data : [data])
      res.json({ accounts, source: 'uob_live' })
    } catch (err) {
      console.error('[UOB] API error:', err.message)
      res.json(UOB_DEMO)
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
