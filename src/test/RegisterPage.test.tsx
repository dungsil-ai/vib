import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockRouter = { push: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import RegisterPage from '@/app/auth/register/page'

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('회원가입 폼을 렌더링한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<RegisterPage />)
    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument()
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument()
  })

  it('로그인 링크가 있다', () => {
    render(<RegisterPage />)
    const link = screen.getByRole('link', { name: '로그인' })
    expect(link).toHaveAttribute('href', '/auth/login')
  })

  it('회원가입 성공 시 로그인 페이지로 이동한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: '가입 성공' }),
    } as Response)
    const user = userEvent.setup()

    render(<RegisterPage />)

    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '홍길동', email: 'test@example.com', password: 'password123' }),
      })
      expect(mockRouter.push).toHaveBeenCalledWith('/auth/login')
    })
  })

  it('회원가입 실패 시 서버 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: '이미 등록된 이메일입니다.' }),
    } as Response)
    const user = userEvent.setup()

    render(<RegisterPage />)

    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('이메일'), 'dup@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(screen.getByText('이미 등록된 이메일입니다.')).toBeInTheDocument()
    })
  })

  it('네트워크 오류 시 일반 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()

    render(<RegisterPage />)

    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(screen.getByText('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    })
  })

  it('가입 중 버튼이 비활성화된다', async () => {
    let resolveResponse: (value: Response) => void
    vi.mocked(global.fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve
      }),
    )
    const user = userEvent.setup()

    render(<RegisterPage />)

    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByText('가입 중...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()

    resolveResponse!({
      ok: true,
      json: () => Promise.resolve({ message: 'ok' }),
    } as Response)
  })

  it('에러 없는 실패 응답 시 기본 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response)
    const user = userEvent.setup()

    render(<RegisterPage />)

    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('이메일'), 'test@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    await waitFor(() => {
      expect(screen.getByText('회원가입에 실패했습니다.')).toBeInTheDocument()
    })
  })
})
