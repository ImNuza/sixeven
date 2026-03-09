import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import Insights from './Insights'
import * as api from '../services/api.js'

vi.mock('../services/api.js', async () => {
  const actual = await vi.importActual('../services/api.js')
  return {
    ...actual,
    fetchInsights: vi.fn(),
    refreshPrices: vi.fn(),
  }
})

test('Insights renders category-specific analytics cards', async () => {
  api.fetchInsights.mockResolvedValue({
    summary: {
      totalNetWorth: 505000,
      totalCost: 435000,
      totalGainLoss: 70000,
      gainLossPct: 16.1,
    },
    metrics: [],
    categoryAnalytics: [
      {
        key: 'cpf',
        title: 'CPF Growth',
        value: '9%',
        accent: 'text-cyan-300',
        subtitle: 'Portfolio weight in CPF',
        metrics: [{ label: 'Projected Annual Interest', value: 1800, format: 'currency' }],
      },
      {
        key: 'property',
        title: 'Property Leverage',
        value: '55%',
        accent: 'text-emerald-300',
        subtitle: 'Loan-to-value estimate',
        metrics: [{ label: 'Estimated Equity', value: 200000, format: 'currency' }],
      },
      {
        key: 'bonds',
        title: 'Bond Ladder',
        value: '2033-07-01',
        accent: 'text-amber-300',
        subtitle: 'Nearest maturity date',
        metrics: [{ label: 'Average Coupon', value: 3.04, format: 'percent' }],
      },
    ],
    highlights: [],
    assetMoves: [],
    priceStatus: 'Latest live market update: 05/03/2026',
  })

  render(
    <MemoryRouter>
      <Insights />
    </MemoryRouter>
  )

  expect(await screen.findByText('CPF Growth')).toBeInTheDocument()
  expect(screen.getByText('Property Leverage')).toBeInTheDocument()
  expect(screen.getByText('Bond Ladder')).toBeInTheDocument()
  expect(screen.getByText('Projected Annual Interest')).toBeInTheDocument()
  expect(screen.getByText('Estimated Equity')).toBeInTheDocument()
  expect(screen.getByText('Average Coupon')).toBeInTheDocument()
})
