export const USER = {
  name: 'Alex Tan',
  location: 'Singapore',
  currency: 'SGD',
  joinedDate: '2024-06-15',
}

export const ASSETS = [
  // Cash & Bank Accounts
  { id: 1, name: 'DBS Savings Account', category: 'CASH', value: 15000, cost: 15000, date: '2020-01-01', institution: 'DBS' },
  { id: 2, name: 'MariBank Savings', category: 'CASH', value: 5000, cost: 5000, date: '2023-03-01', institution: 'MariBank' },

  // Stocks / ETFs
  { id: 3, name: 'AAPL (Apple Inc.)', category: 'STOCKS', value: 8000, cost: 6200, date: '2022-05-10', institution: 'moomoo' },
  { id: 4, name: 'VT (Vanguard Total World)', category: 'STOCKS', value: 12000, cost: 10500, date: '2021-11-20', institution: 'moomoo' },
  { id: 5, name: 'STI ETF', category: 'STOCKS', value: 6000, cost: 5800, date: '2023-01-15', institution: 'Tiger Brokers' },

  // Crypto
  { id: 6, name: 'Bitcoin (BTC)', category: 'CRYPTO', value: 20000, cost: 12000, date: '2021-08-01', institution: 'Ledger Wallet' },
  { id: 7, name: 'Ethereum (ETH)', category: 'CRYPTO', value: 8000, cost: 5500, date: '2021-09-15', institution: 'MetaMask' },

  // Property
  { id: 8, name: 'Condo (Tampines)', category: 'PROPERTY', value: 450000, cost: 380000, date: '2019-06-01', institution: 'Private' },

  // CPF
  { id: 9, name: 'CPF Ordinary Account', category: 'CPF', value: 45000, cost: 45000, date: '2018-01-01', institution: 'CPF Board' },
  { id: 10, name: 'CPF Special Account', category: 'CPF', value: 20000, cost: 20000, date: '2018-01-01', institution: 'CPF Board' },

  // Bonds
  { id: 11, name: 'Singapore Savings Bond', category: 'BONDS', value: 10000, cost: 10000, date: '2023-07-01', institution: 'MAS' },
]

export const NET_WORTH_HISTORY = [
  { month: 'Oct 2025', value: 545000 },
  { month: 'Nov 2025', value: 558000 },
  { month: 'Dec 2025', value: 562000 },
  { month: 'Jan 2026', value: 571000 },
  { month: 'Feb 2026', value: 585000 },
  { month: 'Mar 2026', value: 599000 },
]

export const MOCK_INSIGHTS = [
  {
    type: 'warning',
    title: 'High Property Concentration',
    message: 'Your property makes up 75% of your total net worth. Consider diversifying into more liquid asset classes to reduce concentration risk.',
  },
  {
    type: 'warning',
    title: 'Low Liquidity Ratio',
    message: 'Only 12% of your portfolio is in liquid assets. Aim for at least 20% to handle unexpected expenses or market opportunities.',
  },
  {
    type: 'positive',
    title: 'Healthy Emergency Fund',
    message: 'Your cash reserves cover ~6.7 months of expenses. You\'re meeting the recommended 6-month buffer.',
  },
  {
    type: 'positive',
    title: 'Crypto Exposure in Check',
    message: 'Your crypto allocation is 4.7% — well within the recommended <30% threshold. Good risk management.',
  },
  {
    type: 'info',
    title: 'Strong Unrealized Gains',
    message: 'Your stocks and crypto portfolio shows +43% unrealized gains. Consider reviewing your exit strategy or rebalancing targets.',
  },
]
