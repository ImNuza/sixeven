import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ChevronLeft, Loader2, MapPinned, ShieldCheck, Sparkles, WalletCards,
  Building2, Landmark, LineChart, Shield, CheckCircle2,
} from 'lucide-react'
import {
  connectOcbc,
  createAsset,
  fetchMoomooPositions,
  fetchMomooDemoPositions,
  fetchSingpassAuthUrl,
  lookupExchangeRate,
  lookupPropertyByPostcode,
  saveWalletConnection,
  updateProfile,
} from '../services/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { saveOnboardingProfile } from '../onboarding/storage.js'

const GOLD = '#C9A84C'
const GOLD2 = '#F0D080'
const DARK = '#080B1A'

const COUNTRY_OPTIONS = [
  'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'India', 'China', 'Hong Kong',
  'Japan', 'South Korea', 'Taiwan', 'Australia', 'New Zealand', 'United States', 'Canada', 'United Kingdom',
  'Ireland', 'France', 'Germany', 'Netherlands', 'Switzerland', 'United Arab Emirates', 'Saudi Arabia',
  'South Africa', 'Other',
]

const EMPLOYMENT_OPTIONS = ['Employed', 'Self-employed', 'Student', 'Retired', 'Other']
const RISK_OPTIONS = ['Conservative', 'Moderate', 'Aggressive']
const INCOME_RANGES = [
  'Below S$30,000',
  'S$30,000 - S$60,000',
  'S$60,001 - S$100,000',
  'S$100,001 - S$180,000',
  'Above S$180,000',
]
const EXPENSE_RANGES = [
  'Below S$2,000',
  'S$2,000 - S$4,000',
  'S$4,001 - S$7,000',
  'S$7,001 - S$10,000',
  'Above S$10,000',
]
const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']
const GOAL_OPTIONS = [
  'Save for retirement',
  'Buy a home',
  'Grow wealth',
  'Pay down debt',
  'Build emergency fund',
  'Generate passive income',
  'Other',
]

const INITIAL_VALUES = {
  fullName: '',
  email: '',
  mobile: '',
  dateOfBirth: '',
  ageRange: '',
  country: 'Singapore',
  employmentStatus: '',
  riskAppetite: '',
  financialGoals: [],
  financialGoalOther: '',
  incomeRange: '',
  monthlyExpensesRange: '',
  liquidAssets: '',
  cpfBalance: '',
  stocksValue: '',
  bondsValue: '',
  cryptoValue: '',
  propertyPostcode: '',
  propertyValue: '',
  mortgageOutstanding: '',
  otherDebts: '',
  bankLinkMode: '',
  manualBankBalance: '',
  walletAddresses: '',
  otherWalletNotes: '',
  linkSingpassNow: false,
  moomooOpenDUrl: 'http://127.0.0.1:33333',
  termsAccepted: false,
}

const STEPS = [
  'welcome',
  'identity',
  'contact',
  'age',
  'country',
  'employment',
  'risk',
  'goals',
  'income',
  'expenses',
  'liquidity',
  'cpf',
  'investments',
  'property',
  'debts',
  'banking',
  'wallets',
  'integrations',
  'consent',
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(value)
}

function parseAmount(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function cardStyle() {
  return {
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '2rem',
    padding: '2.25rem 2rem',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
  }
}

function inputStyle() {
  return {
    width: '100%',
    borderRadius: '1rem',
    border: '1.5px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    padding: '0.95rem 1rem',
    fontSize: '1rem',
    outline: 'none',
  }
}

function buttonStyle(primary = true) {
  return primary
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: `linear-gradient(135deg, ${GOLD2} 0%, ${GOLD} 100%)`,
        color: DARK,
        fontWeight: 700,
        fontSize: '0.95rem',
        padding: '0.95rem 1.6rem',
        borderRadius: '1rem',
        border: 'none',
        cursor: 'pointer',
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: 'transparent',
        color: 'rgba(255,255,255,0.72)',
        fontWeight: 600,
        fontSize: '0.92rem',
        padding: '0.95rem 1.4rem',
        borderRadius: '1rem',
        border: '1px solid rgba(255,255,255,0.12)',
        cursor: 'pointer',
      }
}

function parseWalletAddresses(input) {
  return String(input || '')
    .split(/[\n,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function buildProfilePayload(values, user, propertyLookup, integrationState) {
  const selectedGoals = values.financialGoals.includes('Other')
    ? [...values.financialGoals.filter((goal) => goal !== 'Other'), values.financialGoalOther.trim()].filter(Boolean)
    : values.financialGoals

  const totalTracked =
    parseAmount(values.liquidAssets) +
    parseAmount(values.manualBankBalance) +
    parseAmount(values.cpfBalance) +
    parseAmount(values.stocksValue) +
    parseAmount(values.bondsValue) +
    parseAmount(values.cryptoValue) +
    parseAmount(values.propertyValue)

  return {
    userId: user?.id ?? null,
    username: user?.username ?? '',
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    mobile: values.mobile.trim(),
    dateOfBirth: values.dateOfBirth || null,
    ageRange: values.ageRange || null,
    country: values.country,
    employmentStatus: values.employmentStatus,
    riskAppetite: values.riskAppetite,
    financialGoals: selectedGoals,
    incomeRange: values.incomeRange,
    monthlyExpensesRange: values.monthlyExpensesRange,
    liquidAssets: parseAmount(values.liquidAssets),
    cpfBalance: parseAmount(values.cpfBalance),
    stocksValue: parseAmount(values.stocksValue),
    bondsValue: parseAmount(values.bondsValue),
    cryptoValue: parseAmount(values.cryptoValue),
    propertyPostcode: values.propertyPostcode.trim(),
    propertyValue: parseAmount(values.propertyValue),
    mortgageOutstanding: parseAmount(values.mortgageOutstanding),
    propertyLookup,
    otherDebts: parseAmount(values.otherDebts),
    bankLinkMode: values.bankLinkMode,
    manualBankBalance: parseAmount(values.manualBankBalance),
    walletAddresses: parseWalletAddresses(values.walletAddresses),
    otherWalletNotes: values.otherWalletNotes.trim(),
    singpassLinked: integrationState.singpassLaunched,
    ocbcLinked: integrationState.ocbcConnected,
    moomooImported: integrationState.moomooImported,
    moomooAccountId: integrationState.moomooAccountId,
    completedAt: new Date().toISOString(),
    estimatedNetWorthTracked: totalTracked,
  }
}

async function persistPortfolioAssets(values, propertyLookup) {
  const today = new Date().toISOString().slice(0, 10)
  const maturity = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const assets = [
    parseAmount(values.liquidAssets) > 0 ? {
      name: 'Liquid Assets',
      category: 'CASH',
      value: parseAmount(values.liquidAssets),
      cost: parseAmount(values.liquidAssets),
      date: today,
      institution: 'Onboarding',
      details: {},
    } : null,
    parseAmount(values.manualBankBalance) > 0 ? {
      name: 'Manual Bank Balance',
      category: 'CASH',
      value: parseAmount(values.manualBankBalance),
      cost: parseAmount(values.manualBankBalance),
      date: today,
      institution: 'Manual Bank Entry',
      details: { importedFrom: 'onboarding-manual-bank' },
    } : null,
    parseAmount(values.cpfBalance) > 0 ? {
      name: 'CPF Balance',
      category: 'CPF',
      value: parseAmount(values.cpfBalance),
      cost: parseAmount(values.cpfBalance),
      date: today,
      institution: 'Onboarding',
      details: { accountType: 'Combined' },
    } : null,
    parseAmount(values.stocksValue) > 0 ? {
      name: 'Stocks / Funds Portfolio',
      category: 'STOCKS',
      value: parseAmount(values.stocksValue),
      cost: parseAmount(values.stocksValue),
      date: today,
      institution: 'Onboarding',
      details: {},
    } : null,
    parseAmount(values.bondsValue) > 0 ? {
      name: 'Bond Portfolio',
      category: 'BONDS',
      value: parseAmount(values.bondsValue),
      cost: parseAmount(values.bondsValue),
      date: today,
      institution: 'Onboarding',
      details: { issuer: 'Various', maturityDate: maturity },
    } : null,
    parseAmount(values.cryptoValue) > 0 ? {
      name: 'Crypto Portfolio',
      category: 'CRYPTO',
      value: parseAmount(values.cryptoValue),
      cost: parseAmount(values.cryptoValue),
      date: today,
      institution: 'Onboarding',
      details: {},
    } : null,
    parseAmount(values.propertyValue) > 0 ? {
      name: propertyLookup?.address || 'Property',
      category: 'PROPERTY',
      value: parseAmount(values.propertyValue),
      cost: parseAmount(values.propertyValue),
      date: today,
      institution: propertyLookup?.town || 'Onboarding',
      details: {
        address: propertyLookup?.address || 'Property',
        remainingLoan: parseAmount(values.mortgageOutstanding),
        postcode: values.propertyPostcode.trim(),
        latestHdbResalePrice: propertyLookup?.hdb?.latestResalePrice || null,
      },
    } : null,
  ].filter(Boolean)

  console.log('[Onboarding] Creating portfolio assets:', assets.length, 'items')
  
  const createdAssets = []
  for (const asset of assets) {
    try {
      const created = await createAsset(asset)
      console.log('[Onboarding] ✓ Created asset:', asset.name, '(' + asset.category + ')', 'Value:', asset.value)
      createdAssets.push(created)
    } catch (err) {
      console.error('[Onboarding] ✗ Failed to create asset:', asset.name, err.message)
      throw new Error(`Failed to create ${asset.name}: ${err.message}`)
    }
  }
  
  console.log('[Onboarding] Portfolio assets completed:', createdAssets.length, 'successful')
  return createdAssets
}

async function importMoomooPortfolio(payload) {
  const data = payload.source === 'demo'
    ? await fetchMomooDemoPositions()
    : await fetchMoomooPositions(payload.openDUrl)

  const today = new Date().toISOString().split('T')[0]
  
  console.log('[Onboarding] Importing moomoo portfolio:', data.positions?.length || 0, 'positions')
  
  for (const position of data.positions || []) {
    try {
      const isSgd = position.currency === 'SGD'
      let rate = 1
      if (!isSgd) {
        try {
          rate = await lookupExchangeRate(position.currency, 'SGD')
          console.log('[Onboarding] Fetched FX rate:', position.currency, '/SGD =', rate)
        } catch (err) {
          console.warn('[Onboarding] Failed to fetch FX rate for', position.currency, ', using fallback 1.35')
          rate = 1.35
        }
      }
      
      await createAsset({
        name: position.name || position.ticker,
        category: 'STOCKS',
        ticker: position.ticker,
        quantity: position.quantity,
        value: Math.round(position.marketValue * rate * 100) / 100,
        cost: position.avgCost > 0 ? Math.round(position.avgCost * position.quantity * rate * 100) / 100 : Math.round(position.marketValue * rate * 100) / 100,
        date: today,
        institution: payload.source === 'demo' ? 'moomoo SG (Demo)' : 'moomoo SG',
        details: {
          importedFrom: 'moomoo',
          currency: position.currency,
          originalCode: position.code,
          conversionRate: rate,
        },
      })
      console.log('[Onboarding] ✓ Imported moomoo position:', position.name, '(' + position.currency + ')', 'Value SGD:', Math.round(position.marketValue * rate * 100) / 100)
    } catch (err) {
      console.error('[Onboarding] ✗ Failed to import moomoo position:', position.name, err.message)
    }
  }

  return data
}

function StepShell({ step, total, title, description, children }) {
  return (
    <div>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        Step {step} of {total}
      </p>
      <h2 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', fontWeight: 700, lineHeight: 1.3, marginBottom: '0.75rem' }}>
        {title}
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.52)', lineHeight: 1.65, marginBottom: '1.5rem' }}>
        {description}
      </p>
      {children}
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState(() => ({
    ...INITIAL_VALUES,
    email: user?.email || '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [propertyLookupState, setPropertyLookupState] = useState({ loading: false, data: null, error: '' })
  const [integrationState, setIntegrationState] = useState({
    ocbcConnecting: false,
    ocbcConnected: false,
    ocbcError: '',
    singpassLaunching: false,
    singpassLaunched: false,
    singpassError: '',
    moomooLoading: false,
    moomooImported: false,
    moomooAccountId: '',
    moomooError: '',
    walletSaving: false,
    walletSaved: 0,
  })

  const step = STEPS[stepIndex]
  const totalProgressSteps = STEPS.length - 1
  const progress = Math.round((stepIndex / totalProgressSteps) * 100)
  const onboardingProfile = useMemo(
    () => buildProfilePayload(values, user, propertyLookupState.data, integrationState),
    [values, user, propertyLookupState.data, integrationState]
  )

  function setField(key, value) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function toggleGoal(goal) {
    setValues((current) => ({
      ...current,
      financialGoals: current.financialGoals.includes(goal)
        ? current.financialGoals.filter((item) => item !== goal)
        : [...current.financialGoals, goal],
    }))
  }

  function back() {
    if (stepIndex > 0) {
      setError('')
      setStepIndex((current) => current - 1)
    }
  }

  async function handlePropertyLookup() {
    setPropertyLookupState({ loading: true, data: null, error: '' })
    try {
      const data = await lookupPropertyByPostcode(values.propertyPostcode)
      setPropertyLookupState({ loading: false, data, error: '' })
    } catch (err) {
      setPropertyLookupState({ loading: false, data: null, error: err.message || 'Property lookup failed.' })
    }
  }

  async function handleConnectOcbc() {
    setIntegrationState((current) => ({ ...current, ocbcConnecting: true, ocbcError: '' }))
    try {
      await connectOcbc()
      setIntegrationState((current) => ({ ...current, ocbcConnecting: false, ocbcConnected: true, ocbcError: '' }))
      setField('bankLinkMode', 'Connect OCBC now')
    } catch (err) {
      setIntegrationState((current) => ({ ...current, ocbcConnecting: false, ocbcConnected: false, ocbcError: err.message || 'OCBC connection failed.' }))
    }
  }

  async function handleLaunchSingpass() {
    setIntegrationState((current) => ({ ...current, singpassLaunching: true, singpassError: '' }))
    try {
      const { authUrl } = await fetchSingpassAuthUrl()
      window.open(authUrl, '_blank', 'noopener,noreferrer')
      setIntegrationState((current) => ({ ...current, singpassLaunching: false, singpassLaunched: true }))
      setField('linkSingpassNow', true)
    } catch (err) {
      setIntegrationState((current) => ({ ...current, singpassLaunching: false, singpassError: err.message || 'Singpass launch failed.' }))
    }
  }

  async function handleSaveWallets() {
    const addresses = parseWalletAddresses(values.walletAddresses).filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address))
    setIntegrationState((current) => ({ ...current, walletSaving: true }))
    try {
      for (const address of addresses) {
        await saveWalletConnection(address, 1, 'Onboarding Wallet')
      }
      setIntegrationState((current) => ({ ...current, walletSaving: false, walletSaved: addresses.length }))
    } catch (err) {
      setIntegrationState((current) => ({ ...current, walletSaving: false }))
      setError(err.message || 'Wallet save failed.')
    }
  }

  async function handleImportMoomoo(source) {
    setIntegrationState((current) => ({ ...current, moomooLoading: true, moomooError: '' }))
    try {
      const data = await importMoomooPortfolio({ source, openDUrl: values.moomooOpenDUrl })
      setIntegrationState((current) => ({
        ...current,
        moomooLoading: false,
        moomooImported: true,
        moomooAccountId: data.accountId || '',
        moomooError: '',
      }))
    } catch (err) {
      setIntegrationState((current) => ({ ...current, moomooLoading: false, moomooImported: false, moomooError: err.message || 'moomoo import failed.' }))
    }
  }

  function validateCurrentStep() {
    switch (step) {
      case 'welcome':
        return ''
      case 'identity':
        return values.fullName.trim() ? '' : 'Full name is required.'
      case 'contact':
        if (!values.email.trim()) return 'Email address is required.'
        if (!values.mobile.trim()) return 'Mobile number is required.'
        return ''
      case 'age':
        return values.dateOfBirth || values.ageRange ? '' : 'Add either your date of birth or your age range.'
      case 'country':
        return values.country ? '' : 'Choose your country or region.'
      case 'employment':
        return values.employmentStatus ? '' : 'Choose your employment status.'
      case 'risk':
        return values.riskAppetite ? '' : 'Choose your risk appetite.'
      case 'goals':
        if (!values.financialGoals.length) return 'Choose at least one financial goal.'
        if (values.financialGoals.includes('Other') && !values.financialGoalOther.trim()) {
          return 'Please describe your other financial goal.'
        }
        return ''
      case 'income':
        return values.incomeRange ? '' : 'Choose your annual income range.'
      case 'expenses':
        return values.monthlyExpensesRange ? '' : 'Choose your monthly expense range.'
      case 'liquidity':
        return parseAmount(values.liquidAssets) > 0 ? '' : 'Enter your approximate liquid assets.'
      case 'property':
        if (values.propertyPostcode && !propertyLookupState.data && !propertyLookupState.loading) {
          return 'Use the lookup button to resolve the property postcode first.'
        }
        return ''
      case 'consent':
        return values.termsAccepted ? '' : 'You must agree before continuing.'
      default:
        return ''
    }
  }

  async function next() {
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      return
    }

    if (stepIndex < STEPS.length - 1) {
      setError('')
      setStepIndex((current) => current + 1)
      return
    }

    setSaving(true)
    setError('')
    try {
      saveOnboardingProfile(onboardingProfile)
      if (values.email.trim()) {
        await updateProfile({ email: values.email.trim() })
      }
      const walletAddresses = parseWalletAddresses(values.walletAddresses).filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address))
      if (walletAddresses.length && integrationState.walletSaved === 0) {
        for (const address of walletAddresses) {
          await saveWalletConnection(address, 1, 'Onboarding Wallet')
        }
      }
      await persistPortfolioAssets(values, propertyLookupState.data)
      console.log('[Onboarding] ✓ All onboarding steps complete')
      setCompleted(true)
    } catch (err) {
      console.error('[Onboarding] ✗ Onboarding failed:', err)
      setError(err.message || 'We could not complete onboarding. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function renderChoice(options, key) {
    return (
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        {options.map((option) => {
          const active = values[key] === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setField(key, option)}
              style={{
                ...buttonStyle(false),
                justifyContent: 'flex-start',
                color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                borderColor: active ? `${GOLD}80` : 'rgba(255,255,255,0.12)',
                background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
              }}
            >
              {option}
            </button>
          )
        })}
      </div>
    )
  }

  function renderStep() {
    switch (step) {
      case 'welcome':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: `radial-gradient(circle at 40% 35%, ${GOLD2}, ${GOLD})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              boxShadow: '0 0 40px rgba(201,168,76,0.35)',
            }}>
              <Sparkles size={32} color={DARK} strokeWidth={2} />
            </div>
            <p style={{ fontSize: '0.76rem', letterSpacing: '0.22em', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              WEALTH WELLNESS PROFILE
            </p>
            <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Welcome to your personalised onboarding
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.7, fontSize: '1rem', maxWidth: 560, margin: '0 auto' }}>
              We need a few pieces of information to create your Wealth Wellness profile. Everything is confidential and only used to personalise your dashboard, insights, and projections.
            </p>
          </div>
        )
      case 'identity':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="What is your full name?" description="We will use this to personalise your dashboard and reports.">
            <input value={values.fullName} onChange={(event) => setField('fullName', event.target.value)} placeholder="e.g. Jamie Tan" style={inputStyle()} />
          </StepShell>
        )
      case 'contact':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Which email address and mobile number should we use?" description="We use these for account verification and notifications.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <input type="email" value={values.email} onChange={(event) => setField('email', event.target.value)} placeholder="you@example.com" style={inputStyle()} />
              <input type="tel" value={values.mobile} onChange={(event) => setField('mobile', event.target.value)} placeholder="+65 9123 4567" style={inputStyle()} />
            </div>
          </StepShell>
        )
      case 'age':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="What is your date of birth or age range?" description="This helps tailor your long-term projections.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <input type="date" value={values.dateOfBirth} onChange={(event) => setField('dateOfBirth', event.target.value)} style={inputStyle()} />
              <select value={values.ageRange} onChange={(event) => setField('ageRange', event.target.value)} style={inputStyle()}>
                <option value="">Or choose an age range</option>
                {AGE_RANGES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </StepShell>
        )
      case 'country':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Which country or region do you live in?" description="We use this to keep guidance relevant to your market and regulatory context.">
            <select value={values.country} onChange={(event) => setField('country', event.target.value)} style={inputStyle()}>
              <option value="">Select your country / region</option>
              {COUNTRY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </StepShell>
        )
      case 'employment':
        return <StepShell step={stepIndex} total={totalProgressSteps} title="What is your employment status?" description="Choose the option that best describes your current situation.">{renderChoice(EMPLOYMENT_OPTIONS, 'employmentStatus')}</StepShell>
      case 'risk':
        return <StepShell step={stepIndex} total={totalProgressSteps} title="How would you describe your risk appetite?" description="This shapes the tone of your portfolio guidance.">{renderChoice(RISK_OPTIONS, 'riskAppetite')}</StepShell>
      case 'goals':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="What are your primary financial goals?" description="Choose all that apply.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {GOAL_OPTIONS.map((goal) => {
                const active = values.financialGoals.includes(goal)
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => toggleGoal(goal)}
                    style={{
                      ...buttonStyle(false),
                      color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                      borderColor: active ? `${GOLD}80` : 'rgba(255,255,255,0.12)',
                      background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
                    }}
                  >
                    {goal}
                  </button>
                )
              })}
            </div>
            {values.financialGoals.includes('Other') && (
              <input
                value={values.financialGoalOther}
                onChange={(event) => setField('financialGoalOther', event.target.value)}
                placeholder="Describe your other financial goal"
                style={{ ...inputStyle(), marginTop: '1rem' }}
              />
            )}
          </StepShell>
        )
      case 'income':
        return <StepShell step={stepIndex} total={totalProgressSteps} title="Which annual income range best describes you?" description="Choose the closest range.">{renderChoice(INCOME_RANGES, 'incomeRange')}</StepShell>
      case 'expenses':
        return <StepShell step={stepIndex} total={totalProgressSteps} title="What is your approximate monthly living expense level?" description="A broad range is enough.">{renderChoice(EXPENSE_RANGES, 'monthlyExpensesRange')}</StepShell>
      case 'liquidity':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="How much do you roughly hold in liquid assets?" description="Cash, savings, and cash-equivalents only.">
            <input type="number" value={values.liquidAssets} onChange={(event) => setField('liquidAssets', event.target.value)} placeholder="e.g. 35000" style={inputStyle()} />
          </StepShell>
        )
      case 'cpf':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="What is your approximate CPF balance?" description="This is optional. You can skip it if you prefer.">
            <input type="number" value={values.cpfBalance} onChange={(event) => setField('cpfBalance', event.target.value)} placeholder="Optional" style={inputStyle()} />
          </StepShell>
        )
      case 'investments':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Give us broad estimates of your investments" description="Approximate values are enough.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <input type="number" value={values.stocksValue} onChange={(event) => setField('stocksValue', event.target.value)} placeholder="Stocks / ETFs / funds (SGD)" style={inputStyle()} />
              <input type="number" value={values.bondsValue} onChange={(event) => setField('bondsValue', event.target.value)} placeholder="Bonds / fixed income (SGD)" style={inputStyle()} />
              <input type="number" value={values.cryptoValue} onChange={(event) => setField('cryptoValue', event.target.value)} placeholder="Crypto (SGD)" style={inputStyle()} />
            </div>
          </StepShell>
        )
      case 'property':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Tell us about any property you own" description="Add a Singapore postcode to look up the address and recent HDB resale data.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input type="text" value={values.propertyPostcode} onChange={(event) => setField('propertyPostcode', event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit postcode" style={{ ...inputStyle(), flex: 1, minWidth: 220 }} />
                <button type="button" onClick={handlePropertyLookup} disabled={propertyLookupState.loading || values.propertyPostcode.length !== 6} style={buttonStyle(false)}>
                  {propertyLookupState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
                  Lookup
                </button>
              </div>
              {propertyLookupState.error && <p style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{propertyLookupState.error}</p>}
              {propertyLookupState.data && (
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                  <p style={{ fontWeight: 600 }}>{propertyLookupState.data.address}</p>
                  <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: '0.35rem' }}>{propertyLookupState.data.town || 'Singapore'}</p>
                  {propertyLookupState.data.hdb?.latestResalePrice && (
                    <p style={{ color: '#86efac', marginTop: '0.6rem' }}>
                      Latest nearby HDB resale reference: {formatCurrency(propertyLookupState.data.hdb.latestResalePrice)}
                    </p>
                  )}
                </div>
              )}
              <input type="number" value={values.propertyValue} onChange={(event) => setField('propertyValue', event.target.value)} placeholder="Property value (SGD)" style={inputStyle()} />
              <input type="number" value={values.mortgageOutstanding} onChange={(event) => setField('mortgageOutstanding', event.target.value)} placeholder="Outstanding mortgage (SGD)" style={inputStyle()} />
            </div>
          </StepShell>
        )
      case 'debts':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Do you have any other debts or loans?" description="If yes, enter the approximate total.">
            <input type="number" value={values.otherDebts} onChange={(event) => setField('otherDebts', event.target.value)} placeholder="Optional" style={inputStyle()} />
          </StepShell>
        )
      case 'banking':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Would you like to link your bank accounts now?" description="You can connect OCBC now or add a manual bank balance instead.">
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {['Connect OCBC now', 'Enter balances manually', 'Do this later'].map((option) => {
                const active = values.bankLinkMode === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setField('bankLinkMode', option)}
                    style={{
                      ...buttonStyle(false),
                      justifyContent: 'flex-start',
                      color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                      borderColor: active ? `${GOLD}80` : 'rgba(255,255,255,0.12)',
                      background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
                    }}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            {values.bankLinkMode === 'Connect OCBC now' && (
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
                <button type="button" onClick={handleConnectOcbc} disabled={integrationState.ocbcConnecting || integrationState.ocbcConnected} style={buttonStyle(true)}>
                  {integrationState.ocbcConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                  {integrationState.ocbcConnected ? 'OCBC connected' : 'Connect OCBC'}
                </button>
                {integrationState.ocbcError && <p style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{integrationState.ocbcError}</p>}
              </div>
            )}
            {values.bankLinkMode === 'Enter balances manually' && (
              <input type="number" value={values.manualBankBalance} onChange={(event) => setField('manualBankBalance', event.target.value)} placeholder="Manual bank balance (SGD)" style={{ ...inputStyle(), marginTop: '1rem' }} />
            )}
          </StepShell>
        )
      case 'wallets':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Would you like to specify your wallet addresses?" description="Paste one or more EVM wallet addresses. We will save valid addresses and show them in your dashboard and connected accounts.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <textarea value={values.walletAddresses} onChange={(event) => setField('walletAddresses', event.target.value)} placeholder="One 0x address per line" rows={4} style={{ ...inputStyle(), minHeight: 120 }} />
              <input value={values.otherWalletNotes} onChange={(event) => setField('otherWalletNotes', event.target.value)} placeholder="Optional: note any non-EVM wallets or custodians" style={inputStyle()} />
              <button type="button" onClick={handleSaveWallets} disabled={integrationState.walletSaving} style={buttonStyle(false)}>
                {integrationState.walletSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                Save wallet addresses
              </button>
              {integrationState.walletSaved > 0 && (
                <p style={{ color: '#86efac', fontSize: '0.9rem' }}>{integrationState.walletSaved} wallet address{integrationState.walletSaved > 1 ? 'es' : ''} saved.</p>
              )}
            </div>
          </StepShell>
        )
      case 'integrations':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Optional account connections and imports" description="You can connect Singpass now and import moomoo positions during onboarding, or do it later from Account.">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.8rem' }}>
                  <Shield className="h-4 w-4" style={{ color: '#e30613' }} />
                  <strong>Singpass</strong>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.52)', marginBottom: '0.8rem' }}>Launch Singpass / SGFinDex consent during onboarding. It opens in a new tab so you do not lose your place here.</p>
                <button type="button" onClick={handleLaunchSingpass} disabled={integrationState.singpassLaunching} style={buttonStyle(false)}>
                  {integrationState.singpassLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {integrationState.singpassLaunched ? 'Singpass launched' : 'Launch Singpass'}
                </button>
                {integrationState.singpassError && <p style={{ color: '#fca5a5', marginTop: '0.6rem' }}>{integrationState.singpassError}</p>}
              </div>

              <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.8rem' }}>
                  <LineChart className="h-4 w-4" style={{ color: '#ff7a00' }} />
                  <strong>moomoo positions</strong>
                </div>
                <input value={values.moomooOpenDUrl} onChange={(event) => setField('moomooOpenDUrl', event.target.value)} placeholder="OpenD URL (e.g. http://127.0.0.1:33333)" style={{ ...inputStyle(), marginBottom: '0.8rem' }} />
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => handleImportMoomoo('live')} disabled={integrationState.moomooLoading} style={buttonStyle(false)}>
                    {integrationState.moomooLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    Import via OpenD
                  </button>
                  <button type="button" onClick={() => handleImportMoomoo('demo')} disabled={integrationState.moomooLoading} style={buttonStyle(false)}>
                    {integrationState.moomooLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Load demo portfolio
                  </button>
                </div>
                {integrationState.moomooImported && (
                  <p style={{ color: '#86efac', marginTop: '0.6rem' }}>moomoo portfolio imported{integrationState.moomooAccountId ? ` (${integrationState.moomooAccountId})` : ''}.</p>
                )}
                {integrationState.moomooError && <p style={{ color: '#fca5a5', marginTop: '0.6rem' }}>{integrationState.moomooError}</p>}
              </div>
            </div>
          </StepShell>
        )
      case 'consent':
        return (
          <StepShell step={stepIndex} total={totalProgressSteps} title="Before we build your profile, please confirm the following" description="By proceeding, you agree to the Terms of Service and Privacy Policy, and you understand the app provides general guidance rather than licensed financial advice.">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '1rem 1.1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
              <input type="checkbox" checked={values.termsAccepted} onChange={(event) => setField('termsAccepted', event.target.checked)} style={{ marginTop: '0.2rem' }} />
              <span style={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>
                I understand and agree. I also confirm I have not entered sensitive information such as account passwords, NRIC numbers, or bank card details.
              </span>
            </label>
          </StepShell>
        )
      default:
        return null
    }
  }

  if (completed) {
    return (
      <div style={{ minHeight: '100vh', background: DARK, color: '#fff', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 720, ...cardStyle(), textAlign: 'center' }}>
          <div style={{ width: 68, height: 68, margin: '0 auto 1.25rem', borderRadius: '50%', background: 'rgba(16,185,129,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={30} color="#34d399" />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.8rem' }}>Thank you, {onboardingProfile.fullName || user?.username}.</h1>
          <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.7, marginBottom: '1rem' }}>
            Your onboarding is complete. SafeSeven will use your answers to build your Wealth Wellness dashboard and personalise future insights.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginBottom: '1.8rem' }}>
            Estimated assets captured: {formatCurrency(onboardingProfile.estimatedNetWorthTracked)}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" onClick={() => { console.log('[Onboarding] Navigating to assets with refresh flag'); setTimeout(() => navigate('/assets?refresh=true', { replace: true }), 500) }} style={buttonStyle(true)}>
              View My Assets <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => navigate('/dashboard', { replace: true })} style={buttonStyle(false)}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, rgba(201,168,76,0.12), transparent 30%), linear-gradient(180deg, #090d22 0%, #050816 100%)',
      color: '#fff',
      fontFamily: "'SF Pro Display','SF Pro Text',ui-sans-serif,system-ui,-apple-system,sans-serif",
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <button type="button" onClick={back} disabled={stepIndex === 0 || saving} style={{ ...buttonStyle(false), opacity: stepIndex === 0 ? 0.45 : 1 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD2}, ${GOLD})` }} />
          </div>
          <div style={{ minWidth: 54, textAlign: 'right', color: 'rgba(255,255,255,0.48)', fontSize: '0.84rem' }}>{progress}%</div>
        </div>

        <div style={cardStyle()}>
          {renderStep()}

          {error && <p style={{ marginTop: '1.25rem', color: '#fca5a5', fontSize: '0.92rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={next} disabled={saving} style={buttonStyle(true)}>
              {saving ? 'Building profile…' : stepIndex === STEPS.length - 1 ? 'Complete onboarding' : 'Continue'}
              {!saving && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
