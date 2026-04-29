import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

import ReportsPage from '@/app/(dashboard)/reports/page'

// ─── 모크 데이터 ────────────────────────────────────────────────────────────

const mockTrialBalance = {
  accounts: [
    { id: 'acc-1', code: '1001', name: '현금', type: 'ASSET', debitTotal: 1000000, creditTotal: 200000, balance: 800000 },
    { id: 'acc-2', code: '4001', name: '매출', type: 'REVENUE', debitTotal: 0, creditTotal: 500000, balance: 500000 },
  ],
  totalDebits: 1000000,
  totalCredits: 700000,
}

const mockIncomeStatement = {
  revenues: [{ id: 'acc-2', code: '4001', name: '매출', balance: 500000 }],
  expenses: [{ id: 'acc-3', code: '5001', name: '식비', balance: 100000 }],
  totalRevenue: 500000,
  totalExpense: 100000,
  netIncome: 400000,
}

const mockBalanceSheet = {
  assets: [{ id: 'acc-1', code: '1001', name: '현금', balance: 800000 }],
  liabilities: [],
  equity: [{ id: 'acc-4', code: '3001', name: '자본금', balance: 800000 }],
  totalAssets: 800000,
  totalLiabilities: 0,
  totalEquity: 800000,
}

const mockAccounts = [
  { id: 'acc-1', code: '1001', name: '현금', type: 'ASSET', balance: 800000 },
]

const mockLedgerData = {
  account: { id: 'acc-1', code: '1001', name: '현금', type: 'ASSET' },
  openingBalance: 0,
  entries: [
    {
      id: 'entry-1',
      date: '2024-01-15T00:00:00.000Z',
      transactionDescription: '월급',
      entryDescription: null,
      debit: 3000000,
      credit: 0,
      balance: 3000000,
      counterpart: '급여',
    },
  ],
}

const mockMonthlySummary = {
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    revenue: i === 0 ? 500000 : 0,
    expense: i === 0 ? 100000 : 0,
    netIncome: i === 0 ? 400000 : 0,
    cashIn: i === 0 ? 600000 : 0,
    cashOut: i === 0 ? 200000 : 0,
    netCashFlow: i === 0 ? 400000 : 0,
  })),
  totalRevenue: 500000,
  totalExpense: 100000,
  totalNetIncome: 400000,
  totalCashIn: 600000,
  totalCashOut: 200000,
  totalNetCashFlow: 400000,
}

// ─── fetch 모킹 헬퍼 ─────────────────────────────────────────────────────────

function mockFetch(handler: (url: string) => unknown) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const data = handler(url)
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response)
  })
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch(url => {
      if (url.includes('/api/reports/trial-balance')) return mockTrialBalance
      if (url.includes('/api/reports/income-statement')) return mockIncomeStatement
      if (url.includes('/api/reports/balance-sheet')) return mockBalanceSheet
      if (url.includes('/api/accounts')) return mockAccounts
      if (url.includes('/api/reports/ledger')) return mockLedgerData
      if (url.includes('/api/reports/monthly-summary')) return mockMonthlySummary
      return {}
    })
  })

  it('보고서 제목을 표시한다', () => {
    render(<ReportsPage />)
    expect(screen.getByText('보고서')).toBeInTheDocument()
  })

  it('5개의 탭을 렌더링한다', () => {
    render(<ReportsPage />)
    expect(screen.getByRole('button', { name: '시산표' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '총계정원장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '손익계산서' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재무상태표' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '월별 리포트' })).toBeInTheDocument()
  })

  it('기본 탭은 시산표이다', () => {
    render(<ReportsPage />)
    const tab = screen.getByRole('button', { name: '시산표' })
    expect(tab).toHaveClass('border-blue-600')
  })

  describe('시산표', () => {
    it('계정 목록을 표시한다', async () => {
      render(<ReportsPage />)
      await waitFor(() => {
        expect(screen.getByText('현금')).toBeInTheDocument()
        expect(screen.getByText('매출')).toBeInTheDocument()
      })
    })

    it('차변/대변/잔액 열 헤더를 표시한다', async () => {
      render(<ReportsPage />)
      await waitFor(() => {
        expect(screen.getByText('차변 합계')).toBeInTheDocument()
        expect(screen.getByText('대변 합계')).toBeInTheDocument()
        expect(screen.getByText('잔액')).toBeInTheDocument()
      })
    })

    it('합계 행을 표시한다', async () => {
      render(<ReportsPage />)
      await waitFor(() => {
        expect(screen.getByText('합계')).toBeInTheDocument()
      })
    })

    it('API 오류 시 에러 메시지를 표시한다', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: '시산표 조회 실패' }),
      } as Response)

      render(<ReportsPage />)
      await waitFor(() => {
        expect(screen.getByText('시산표 조회 실패')).toBeInTheDocument()
      })
    })
  })

  describe('손익계산서 탭', () => {
    it('탭 전환 후 수익/비용/순이익을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)

      await userEvent_.click(screen.getByRole('button', { name: '손익계산서' }))

      await waitFor(() => {
        expect(screen.getByText('수익')).toBeInTheDocument()
        expect(screen.getByText('비용')).toBeInTheDocument()
        expect(screen.getByText('당기순이익')).toBeInTheDocument()
      })
    })

    it('총 수익/비용 행을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '손익계산서' }))

      await waitFor(() => {
        expect(screen.getByText('총 수익')).toBeInTheDocument()
        expect(screen.getByText('총 비용')).toBeInTheDocument()
      })
    })

    it('빈 데이터 메시지를 표시한다', async () => {
      mockFetch(url => {
        if (url.includes('/api/reports/income-statement'))
          return { revenues: [], expenses: [], totalRevenue: 0, totalExpense: 0, netIncome: 0 }
        if (url.includes('/api/reports/trial-balance')) return mockTrialBalance
        if (url.includes('/api/reports/balance-sheet')) return mockBalanceSheet
        if (url.includes('/api/accounts')) return mockAccounts
        return {}
      })

      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '손익계산서' }))

      await waitFor(() => {
        expect(screen.getByText('수익 내역이 없습니다.')).toBeInTheDocument()
        expect(screen.getByText('비용 내역이 없습니다.')).toBeInTheDocument()
      })
    })
  })

  describe('재무상태표 탭', () => {
    it('탭 전환 후 자산/부채/자본을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '재무상태표' }))

      await waitFor(() => {
        expect(screen.getByText('자산')).toBeInTheDocument()
        expect(screen.getByText('부채')).toBeInTheDocument()
        expect(screen.getByText('자본')).toBeInTheDocument()
      })
    })

    it('대차 균형 시 균형 메시지를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '재무상태표' }))

      await waitFor(() => {
        expect(screen.getByText('✓ 대차 균형')).toBeInTheDocument()
      })
    })

    it('대차 불균형 시 경고 메시지를 표시한다', async () => {
      mockFetch(url => {
        if (url.includes('/api/reports/balance-sheet'))
          return { ...mockBalanceSheet, totalAssets: 999999 }
        if (url.includes('/api/reports/trial-balance')) return mockTrialBalance
        if (url.includes('/api/accounts')) return mockAccounts
        return {}
      })

      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '재무상태표' }))

      await waitFor(() => {
        expect(screen.getByText('⚠ 대차 불균형')).toBeInTheDocument()
      })
    })

    it('재무상태표 API 오류 시 에러를 표시한다', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network error'))

      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '재무상태표' }))

      await waitFor(() => {
        expect(screen.getByText('network error')).toBeInTheDocument()
      })
    })
  })

  describe('총계정원장 탭', () => {
    it('탭 전환 후 계정 선택 안내를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '총계정원장' }))

      await waitFor(() => {
        expect(screen.getByText('계정을 선택하면 원장이 표시됩니다.')).toBeInTheDocument()
      })
    })

    it('계정 선택 후 원장 데이터를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '총계정원장' }))

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      const select = screen.getByRole('combobox')
      await userEvent_.selectOptions(select, 'acc-1')

      await waitFor(() => {
        expect(screen.getByText('월급')).toBeInTheDocument()
        expect(screen.getByText('급여')).toBeInTheDocument()
      })
    })

    it('날짜/적요/상대계정/차변/대변/잔액 헤더를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '총계정원장' }))

      const select = await screen.findByRole('combobox')
      await userEvent_.selectOptions(select, 'acc-1')

      await waitFor(() => {
        expect(screen.getByText('날짜')).toBeInTheDocument()
        expect(screen.getByText('적요')).toBeInTheDocument()
        expect(screen.getByText('상대계정')).toBeInTheDocument()
        expect(screen.getByText('차변')).toBeInTheDocument()
        expect(screen.getByText('대변')).toBeInTheDocument()
      })
    })
  })

  describe('월별 리포트 탭', () => {
    it('탭 전환 후 월별 손익 및 현금흐름 섹션을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getByText('월별 손익')).toBeInTheDocument()
        expect(screen.getByText('월별 현금흐름')).toBeInTheDocument()
      })
    })

    it('월별 손익 테이블에 수익/비용/순손익 헤더를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getByText('수익')).toBeInTheDocument()
        expect(screen.getByText('비용')).toBeInTheDocument()
        expect(screen.getByText('순손익')).toBeInTheDocument()
      })
    })

    it('월별 현금흐름 테이블에 현금 유입/유출/순현금흐름 헤더를 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getByText('현금 유입')).toBeInTheDocument()
        expect(screen.getByText('현금 유출')).toBeInTheDocument()
        expect(screen.getByText('순현금흐름')).toBeInTheDocument()
      })
    })

    it('12개월 행을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getAllByText('1월').length).toBeGreaterThan(0)
        expect(screen.getAllByText('12월').length).toBeGreaterThan(0)
      })
    })

    it('연간 합계 행을 표시한다', async () => {
      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getAllByText('연간 합계').length).toBeGreaterThan(0)
      })
    })

    it('API 오류 시 에러 메시지를 표시한다', async () => {
      mockFetch(url => {
        if (url.includes('/api/reports/monthly-summary')) throw new Error('monthly-summary 오류')
        if (url.includes('/api/reports/trial-balance')) return mockTrialBalance
        if (url.includes('/api/accounts')) return mockAccounts
        return {}
      })

      const userEvent_ = userEvent.setup()
      render(<ReportsPage />)
      await userEvent_.click(screen.getByRole('button', { name: '월별 리포트' }))

      await waitFor(() => {
        expect(screen.getByText('monthly-summary 오류')).toBeInTheDocument()
      })
    })
  })
})
