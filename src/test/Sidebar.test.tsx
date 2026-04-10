import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '@/components/Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}))

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}))

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

describe('Sidebar', () => {
  const user = { name: '홍길동', email: 'hong@example.com' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('사용자 이름과 이메일을 표시한다', () => {
    render(<Sidebar user={user} />)
    expect(screen.getByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('hong@example.com')).toBeInTheDocument()
  })

  it('모든 네비게이션 메뉴를 렌더링한다', () => {
    render(<Sidebar user={user} />)
    expect(screen.getByText('대시보드')).toBeInTheDocument()
    expect(screen.getByText('계정 관리')).toBeInTheDocument()
    expect(screen.getByText('거래 내역')).toBeInTheDocument()
    expect(screen.getByText('예산 관리')).toBeInTheDocument()
  })

  it('현재 경로의 메뉴에 활성화 스타일을 적용한다', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/dashboard')

    render(<Sidebar user={user} />)
    const dashboardLink = screen.getByRole('link', { name: /대시보드/i })
    expect(dashboardLink).toHaveClass('bg-blue-50')
  })

  it('로그아웃 버튼 클릭 시 signOut을 호출한다', async () => {
    const { signOut } = await import('next-auth/react')
    const userEvent_ = userEvent.setup()

    render(<Sidebar user={user} />)
    await userEvent_.click(screen.getByRole('button', { name: /로그아웃/i }))

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/auth/login' })
  })

  it('가계부 제목을 표시한다', () => {
    render(<Sidebar user={user} />)
    expect(screen.getByText('가계부')).toBeInTheDocument()
    expect(screen.getByText('복식부기 방식')).toBeInTheDocument()
  })
})
