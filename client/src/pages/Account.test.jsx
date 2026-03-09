import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Account from './Account'

const navigateMock = vi.fn()
const updateProfileMock = vi.fn()
const changePasswordMock = vi.fn()
const deleteAccountMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { username: 'matth', email: 'matth@example.com' },
    updateProfile: updateProfileMock,
    changePassword: changePasswordMock,
    deleteAccount: deleteAccountMock,
  }),
}))

test('Account submits password changes and deletion requests', async () => {
  const user = userEvent.setup()
  changePasswordMock.mockResolvedValue({})
  deleteAccountMock.mockResolvedValue({ deleted: true })
  updateProfileMock.mockResolvedValue({ user: { username: 'matth', email: 'new@example.com' } })
  vi.spyOn(window, 'confirm').mockReturnValue(true)

  render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>
  )

  await user.clear(screen.getByLabelText(/^email$/i))
  await user.type(screen.getByLabelText(/^email$/i), 'new@example.com')
  await user.click(screen.getByRole('button', { name: /save email/i }))

  await waitFor(() => {
    expect(updateProfileMock).toHaveBeenCalledWith({ email: 'new@example.com' })
  })

  await user.type(screen.getByLabelText(/current password/i), 'password123')
  await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
  await user.click(screen.getByRole('button', { name: /update password/i }))

  await waitFor(() => {
    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: 'password123',
      newPassword: 'newpassword123',
    })
  })

  await user.type(screen.getByLabelText(/confirm with password/i), 'newpassword123')
  await user.click(screen.getByRole('button', { name: /delete account/i }))

  await waitFor(() => {
    expect(deleteAccountMock).toHaveBeenCalledWith({ password: 'newpassword123' })
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })
})
