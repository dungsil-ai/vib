import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockRouter = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import LoginPage from '@/app/auth/login/page'
import { signIn, type SignInResponse } from 'next-auth/react'

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('로그인 폼을 렌더링한다', () => {
    render(<LoginPage />)
    expect(screen.getByText('가계부 로그인')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('회원가입 링크가 있다', () => {
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: '회원가입' })
    expect(link).toHaveAttribute('href', '/auth/register')
  })

  it('로그인 성공 시 대시보드로 이동한다', async () => {
    vi.mocked(signIn).mockResolvedValue({ error: null, ok: true, status: 200, url: '' })
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      })
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
      expect(mockRouter.refresh).toHaveBeenCalled()
    })
  })

  it('로그인 실패 시 에러 메시지를 표시한다', async () => {
    vi.mocked(signIn).mockResolvedValue({ error: 'CredentialsSignin', ok: false, status: 401, url: '' })
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.type(screen.getByLabelText('이메일'), 'wrong@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument()
    })
  })

  it('로그인 중 버튼 텍스트가 변경된다', async () => {
    let resolveSignIn: (value: SignInResponse | undefined) => void = () => {}
    vi.mocked(signIn).mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(screen.getByText('로그인 중...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()

    resolveSignIn({ error: null, ok: true, status: 200, url: '' })
  })
})
