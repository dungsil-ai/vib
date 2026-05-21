import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}))

vi.mock('@/lib/dashboard', () => ({
  getDashboardData: vi.fn(),
}))

import DashboardPage from '@/app/(dashboard)/dashboard/page'
import { requireUser } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard'

const mockDashboardData = {
  totalAssets: 5000000,
  totalLiabilities: 1000000,
  totalEquity: 4000000,
  netWorth: 4000000,
  baseCurrency: 'KRW',
  recentTransactions: [
    {
      id: 'tx-1',
      date: '2024-01-15T00:00:00.000Z',
      description: '월급',
      entries: [
        {
          amount: '3000000',
          currency: 'KRW',
          exchangeRate: '1',
          debitAccount: { name: '현금', code: '101', type: 'ASSET' },
          creditAccount: { name: '급여', code: '401', type: 'REVENUE' },
        },
      ],
    },
  ],
  budgetOverview: [
    {
      accountId: 'acc-1',
      name: '식비',
      code: '501',
      budget: 500000,
      actual: 350000,
    },
  ],
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getDashboardData).mockResolvedValue(mockDashboardData)
  })

  it('대시보드 데이터를 정상적으로 표시한다', async () => {
    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByText('대시보드')).toBeInTheDocument()
    expect(screen.getByText('총 자산')).toBeInTheDocument()
    expect(screen.getByText('총 부채')).toBeInTheDocument()
  })

  it('빈 거래 내역 메시지를 표시한다', async () => {
    vi.mocked(getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      recentTransactions: [],
      budgetOverview: [],
    })

    render(await DashboardPage())

    expect(screen.getByText('거래 내역이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('예산이 설정되지 않았습니다.')).toBeInTheDocument()
  })

  it('requireUser로 인증 사용자 조회 후 데이터 함수를 호출한다', async () => {
    render(await DashboardPage())

    expect(requireUser).toHaveBeenCalledTimes(1)
    expect(getDashboardData).toHaveBeenCalledWith('user-1')
  })

  it('순자산이 음수이면 빨간색으로 표시한다', async () => {
    vi.mocked(getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      netWorth: -100000,
    })

    render(await DashboardPage())

    expect(screen.getByText('-₩100,000')).toHaveClass('text-red-500')
  })

  it('예산을 초과하면 금액과 진행 막대를 빨간색으로 표시한다', async () => {
    vi.mocked(getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      budgetOverview: [
        {
          accountId: 'acc-1',
          name: '식비',
          code: '501',
          budget: 500000,
          actual: 650000,
        },
      ],
    })

    const { container } = render(await DashboardPage())

    expect(screen.getByText('₩650,000 / ₩500,000')).toHaveClass('text-red-500')
    expect(container.querySelector('.bg-red-500')).toBeInTheDocument()
  })
})
