import { useEffect, useMemo, useState } from 'react'
import { ASSET_CATEGORIES } from '../../../shared/constants.js'
import { CATEGORY_DETAIL_CONFIG, normalizeDetails, validateCategoryDetails } from '../data/assetDetails.js'

const PRICED_CATEGORIES = new Set(['STOCKS'])

const emptyForm = {
  name: '',
  category: 'CASH',
  ticker: '',
  quantity: '',
  value: '',
  cost: '',
  date: '',
  institution: '',
  details: {},
}

function toInputValue(value) {
  return value == null ? '' : String(value)
}

function buildInitialValues(initialAsset) {
  if (!initialAsset) {
    return emptyForm
  }

  return {
    name: initialAsset.name || '',
    category: initialAsset.category || 'CASH',
    ticker: initialAsset.ticker || '',
    quantity: toInputValue(initialAsset.quantity),
    value: toInputValue(initialAsset.value),
    cost: toInputValue(initialAsset.cost),
    date: initialAsset.date ? String(initialAsset.date).slice(0, 10) : '',
    institution: initialAsset.institution || '',
    details: normalizeDetails(initialAsset.category, initialAsset.details),
  }
}

function validateForm(values) {
  if (!values.name.trim()) return 'Asset name is required.'
  if (!values.category) return 'Category is required.'
  if (!values.date) return 'Acquisition date is required.'
  if (!values.cost || Number(values.cost) < 0) return 'Cost must be 0 or greater.'

  if (PRICED_CATEGORIES.has(values.category)) {
    if (!values.ticker.trim()) return 'Ticker or coin id is required for live-priced assets.'
    if (!values.quantity || Number(values.quantity) <= 0) return 'Quantity must be greater than 0.'
  } else if (!values.value || Number(values.value) < 0) {
    return 'Current value must be 0 or greater.'
  }

  if (values.category === 'CPF' && !values.details.accountType) {
    return 'Account type is required for CPF assets.'
  }

  if (values.category === 'PROPERTY' && !values.details.postalCode) {
    return 'Postal code is required for property assets.'
  }

  return validateCategoryDetails(values.category, values.details)
}

function normalizePayload(values) {
  const isPriced = PRICED_CATEGORIES.has(values.category)
  const fallbackValue = values.value === '' ? values.cost : values.value

  return {
    name: values.name.trim(),
    category: values.category,
    ticker: isPriced ? values.ticker.trim() : null,
    quantity: isPriced ? Number(values.quantity) : null,
    value: Number(isPriced ? fallbackValue : values.value),
    cost: Number(values.cost),
    date: values.date,
    institution: values.institution.trim() || null,
    details: normalizeDetails(values.category, values.details),
  }
}

export default function AssetForm({
  initialAsset = null,
  onSubmit,
  submitLabel = 'Save Asset',
  isSubmitting = false,
  submitError = '',
}) {
  const [values, setValues] = useState(buildInitialValues(initialAsset))
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    setValues(buildInitialValues(initialAsset))
    setValidationError('')
  }, [initialAsset])

  useEffect(() => {
    if (values.category === 'PROPERTY' && values.details.postalCode && /^\d{6}$/.test(values.details.postalCode)) {
      // Mock estimated price based on postal code
      const basePrice = 500000
      const multiplier = (parseInt(values.details.postalCode.slice(0, 2)) / 10) + 1
      const estimatedPrice = Math.round(basePrice * multiplier)
      setValues(current => ({ ...current, value: estimatedPrice.toString() }))
    }
  }, [values.category, values.details.postalCode])

  const isPricedAsset = useMemo(
    () => PRICED_CATEGORIES.has(values.category),
    [values.category]
  )
  const detailConfig = CATEGORY_DETAIL_CONFIG[values.category]

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => {
      const next = { ...current, [name]: value }

      if (name === 'category') {
        next.details = normalizeDetails(value, current.details)
      }

      return next
    })
  }

  function updateDetailField(event) {
    const { name, value } = event.target
    setValues((current) => ({
      ...current,
      details: {
        ...current.details,
        [name]: value,
      },
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const error = validateForm(values)
    if (error) {
      setValidationError(error)
      return
    }

    setValidationError('')
    await onSubmit(normalizePayload(values))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Asset Name</span>
          <input
            name="name"
            value={values.name}
            onChange={updateField}
            className="app-input mt-2 text-sm"
            placeholder="Bitcoin Wallet"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Category</span>
          <select
            name="category"
            value={values.category}
            onChange={updateField}
            className="app-select mt-2 text-sm"
          >
            {Object.entries(ASSET_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Ticker / Coin ID</span>
          <input
            name="ticker"
            value={values.ticker}
            onChange={updateField}
            className="app-input mt-2 text-sm"
            placeholder={isPricedAsset ? 'AAPL' : 'Optional for manual assets'}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Acquisition Date</span>
          <input
            type="date"
            name="date"
            value={values.date}
            onChange={updateField}
            className="app-input mt-2 text-sm"
          />
        </label>
      </div>

      <div className={`grid gap-4 ${isPricedAsset ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {isPricedAsset ? (
          <>
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Quantity</span>
              <input
                type="number"
                min="0"
                step="any"
                name="quantity"
                value={values.quantity}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="0.5"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Cost Basis (SGD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="cost"
                value={values.cost}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="5000"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Initial Value (SGD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="value"
                value={values.value}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="Optional before price refresh"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Institution</span>
              <input
                name="institution"
                value={values.institution}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="Broker / Wallet / Custodian"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Current Value (SGD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="value"
                value={values.value}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="15000"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Cost Basis (SGD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="cost"
                value={values.cost}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="15000"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Institution</span>
              <input
                name="institution"
                value={values.institution}
                onChange={updateField}
                className="app-input mt-2 text-sm"
                placeholder="MAS / Private"
              />
            </label>
          </>
        )}
      </div>

      {detailConfig ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
            {detailConfig.title}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {detailConfig.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs font-medium tracking-wide text-white/45 uppercase">{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    name={field.key}
                    value={values.details[field.key] || ''}
                    onChange={updateDetailField}
                    className="app-select mt-2 text-sm"
                  >
                    <option value="">Select</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    name={field.key}
                    value={values.details[field.key] || ''}
                    onChange={updateDetailField}
                    step={field.step}
                    placeholder={field.placeholder}
                    className="app-input mt-2 text-sm"
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
        {isPricedAsset
          ? 'Live-priced assets use the backend price service. If you leave Initial Value empty, SafeSeven will use Cost Basis until the next refresh.'
          : 'Manual-value assets keep the value you enter until you edit them again. Crypto assets are currently manual-value only.'}
      </div>

      {(validationError || submitError) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {validationError || submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="app-button-primary inline-flex items-center justify-center px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}
