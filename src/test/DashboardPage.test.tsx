import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

import DashboardPage from '@/app/(dashboard)/dashboard/page'

const mockDashboardData = {
  totalAssets: 5000000,
  totalLiabilities: 1000000,
  totalEquity: 4000000,
  netWorth: 4000000,
  recentTransactions: [
    {
      id: 'tx-1',
      date: '2024-01-15T00:00:00.000Z',
      description: '월급',
      entries: [
        {
          amount: '3000000',
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
    global.fetch = vi.fn()
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<DashboardPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('대시보드 데이터를 정상적으로 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('대시보드')).toBeInTheDocument()
    })

    expect(screen.getByText('총 자산')).toBeInTheDocument()
    expect(screen.getByText('총 부채')).toBeInTheDocument()
    expect(screen.getByText('총 자본')).toBeInTheDocument()
    expect(screen.getByText('순자산')).toBeInTheDocument()
  })

  it('최근 거래를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('월급')).toBeInTheDocument()
    })
  })

  it('예산 현황을 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })
  })

  it('빈 거래 내역 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDashboardData,
          recentTransactions: [],
          budgetOverview: [],
        }),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 내역이 없습니다.')).toBeInTheDocument()
      expect(screen.getByText('예산이 설정되지 않았습니다.')).toBeInTheDocument()
    })
  })

  it('API 오류 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/대시보드 데이터를 불러오지 못했습니다/)).toBeInTheDocument()
    })
  })

  it('네트워크 에러 시 일반 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
    })
  })

  it('음수 순자산에 빨간색 스타일을 적용한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDashboardData,
          netWorth: -500000,
        }),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('순자산')).toBeInTheDocument()
    })

    const netWorthCard = screen.getByText('순자산').closest('div')!
    const amount = netWorthCard.querySelector('.text-red-500')
    expect(amount).not.toBeNull()
  })

  it('예산 초과 시 빨간색 스타일을 적용한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDashboardData,
          budgetOverview: [
            {
              accountId: 'acc-1',
              name: '식비',
              code: '501',
              budget: 300000,
              actual: 500000,
            },
          ],
        }),
    } as Response)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    const budgetText = screen.getByText('식비').closest('div')!
    const overBudget = budgetText.querySelector('.text-red-500')
    expect(overBudget).not.toBeNull()
  })
})
