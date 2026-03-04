export const CATEGORY_DETAIL_CONFIG = {
  CPF: {
    title: 'CPF Details',
    fields: [
      {
        key: 'accountType',
        label: 'Account Type',
        type: 'select',
        options: ['OA', 'SA', 'MA', 'RA'],
      },
      {
        key: 'monthlyContribution',
        label: 'Monthly Contribution (SGD)',
        type: 'number',
        step: '0.01',
        placeholder: '1200',
      },
      {
        key: 'annualInterestRate',
        label: 'Interest Rate (%)',
        type: 'number',
        step: '0.01',
        placeholder: '4.0',
      },
    ],
  },
  PROPERTY: {
    title: 'Property Details',
    fields: [
      {
        key: 'address',
        label: 'Property Address',
        type: 'text',
        placeholder: 'Tampines, Singapore',
      },
      {
        key: 'tenureType',
        label: 'Tenure',
        type: 'select',
        options: ['Freehold', '99-year Leasehold', '999-year Leasehold'],
      },
      {
        key: 'occupancyType',
        label: 'Occupancy',
        type: 'select',
        options: ['Own Stay', 'Investment', 'Mixed Use'],
      },
      {
        key: 'remainingLoan',
        label: 'Remaining Loan (SGD)',
        type: 'number',
        step: '0.01',
        placeholder: '250000',
      },
    ],
  },
  BONDS: {
    title: 'Bond Details',
    fields: [
      {
        key: 'issuer',
        label: 'Issuer',
        type: 'text',
        placeholder: 'MAS',
      },
      {
        key: 'issueCode',
        label: 'Issue Code',
        type: 'text',
        placeholder: 'GX23070A',
      },
      {
        key: 'maturityDate',
        label: 'Maturity Date',
        type: 'date',
      },
      {
        key: 'couponRate',
        label: 'Coupon Rate (%)',
        type: 'number',
        step: '0.01',
        placeholder: '3.04',
      },
    ],
  },
}

export function getDefaultDetails(category) {
  const config = CATEGORY_DETAIL_CONFIG[category]
  if (!config) {
    return {}
  }

  return config.fields.reduce((details, field) => {
    details[field.key] = ''
    return details
  }, {})
}

export function normalizeDetails(category, details = {}) {
  const config = CATEGORY_DETAIL_CONFIG[category]
  if (!config) {
    return {}
  }

  const normalized = getDefaultDetails(category)

  for (const field of config.fields) {
    normalized[field.key] = details?.[field.key] ?? ''
  }

  return normalized
}

export function validateCategoryDetails(category, details = {}) {
  if (category === 'CPF' && !details.accountType) {
    return 'Choose a CPF account type.'
  }

  if (category === 'PROPERTY' && !String(details.address || '').trim()) {
    return 'Property assets should include an address or location.'
  }

  if (category === 'BONDS') {
    if (!String(details.issuer || '').trim()) {
      return 'Bond assets should include an issuer.'
    }
    if (!details.maturityDate) {
      return 'Bond assets should include a maturity date.'
    }
  }

  return ''
}

export function summarizeAssetDetails(asset) {
  const details = asset?.details || {}

  switch (asset?.category) {
    case 'CPF':
      return [details.accountType, details.annualInterestRate ? `${details.annualInterestRate}% interest` : '']
        .filter(Boolean)
        .join(' • ')
    case 'PROPERTY':
      return [details.address, details.tenureType, details.occupancyType]
        .filter(Boolean)
        .join(' • ')
    case 'BONDS':
      return [details.issuer, details.couponRate ? `${details.couponRate}% coupon` : '', details.maturityDate]
        .filter(Boolean)
        .join(' • ')
    default:
      return ''
  }
}
