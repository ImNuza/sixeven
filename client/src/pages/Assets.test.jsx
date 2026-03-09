import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Assets from './Assets'
import * as api from '../services/api.js'

vi.mock('../services/api.js', async () => {
  const actual = await vi.importActual('../services/api.js')
  return {
    ...actual,
    fetchAssetsPage: vi.fn(),
    fetchPrices: vi.fn(),
    refreshPrices: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
  }
})

const pageOne = [
  {
    id: 1,
    name: 'CPF Ordinary Account',
    category: 'CPF',
    ticker: null,
    value: 45000,
    cost: 45000,
    quantity: null,
    date: '2026-03-05',
    institution: 'CPF Board',
    details: { accountType: 'OA', annualInterestRate: '2.5' },
  },
]

const pageTwo = [
  {
    id: 2,
    name: 'Condo (Tampines)',
    category: 'PROPERTY',
    ticker: null,
    value: 450000,
    cost: 380000,
    quantity: null,
    date: '2026-03-05',
    institution: 'Private',
    details: { address: 'Tampines, Singapore', tenureType: '99-year Leasehold' },
  },
]

function mockPage(items, page = 1, totalPages = 2, total = 2) {
  return {
    items,
    pagination: {
      page,
      pageSize: 1,
      total,
      totalPages,
    },
    filters: {},
    sorting: {},
  }
}

test('Assets sends backend query params for search, sorting, and pagination', async () => {
  api.fetchPrices.mockResolvedValue([{ updated_at: '2026-03-05T04:00:00.000Z' }])
  api.fetchAssetsPage.mockImplementation(async (query) => {
    if (query.page === 2) {
      return mockPage(pageTwo, 2)
    }
    return mockPage(pageOne, 1)
  })

  const user = userEvent.setup()

  render(
    <MemoryRouter>
      <Assets />
    </MemoryRouter>
  )

  await screen.findByText('CPF Ordinary Account')
  expect(api.fetchAssetsPage).toHaveBeenCalledWith(
    expect.objectContaining({
      page: 1,
      pageSize: 6,
      search: '',
      category: 'ALL',
      pricing: 'ALL',
      sortBy: 'value',
      sortDirection: 'desc',
    })
  )

  await user.click(screen.getByRole('button', { name: /p&l/i }))

  await waitFor(() => {
    expect(api.fetchAssetsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sortBy: 'pnl',
        sortDirection: 'desc',
      })
    )
  })

  fireEvent.change(screen.getByPlaceholderText(/search assets/i), {
    target: { value: 'cpf' },
  })

  await waitFor(() => {
    expect(api.fetchAssetsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'cpf',
        page: 1,
      })
    )
  })

  await user.click(screen.getByRole('button', { name: /next/i }))

  await waitFor(() => {
    expect(api.fetchAssetsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 2,
      })
    )
  })

  expect(await screen.findByText('Condo (Tampines)')).toBeInTheDocument()
})
