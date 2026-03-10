import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import Insights from './Insights'
import * as api from '../services/api.js'
import { ChatProvider } from '../context/ChatContext.jsx'

vi.mock('../services/api.js', async () => {
  const actual = await vi.importActual('../services/api.js')
  return {
    ...actual,
    fetchAssets: vi.fn(),
    fetchPortfolioSummary: vi.fn(),
    refreshPrices: vi.fn(),
  }
})

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 1, username: 'test' } }),
}))

test('Insights renders wellness score and breakdown', async () => {
  api.fetchAssets.mockResolvedValue([
    { id: 1, name: 'CPF OA', category: 'CPF', value: 45000, cost: 45000, quantity: null, details: { annualInterestRate: '2.5' } },
    { id: 2, name: 'Condo', category: 'PROPERTY', value: 450000, cost: 380000, quantity: null, details: { remainingLoan: '200000' } },
    { id: 3, name: 'Savings', category: 'CASH', value: 10000, cost: 10000, quantity: null, details: {} },
  ])
  api.fetchPortfolioSummary.mockResolvedValue({
    totalNetWorth: 505000,
    totalCost: 435000,
    totalGainLoss: 70000,
    gainLossPct: 16.1,
    monthlyChangePct: 0.5,
  })

  render(
    <MemoryRouter>
      <ChatProvider>
        <Insights />
      </ChatProvider>
    </MemoryRouter>
  )

  expect(await screen.findByText('Portfolio Insights')).toBeInTheDocument()
  expect(screen.getByText('Financial Health Score')).toBeInTheDocument()
})
