import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

import BudgetPage from '@/app/(dashboard)/budget/page'

const mockAccounts = [
  { id: 'exp-1', code: '501', name: '식비', type: 'EXPENSE', balance: 0 },
  { id: 'exp-2', code: '502', name: '교통비', type: 'EXPENSE', balance: 0 },
  { id: 'asset-1', code: '101', name: '현금', type: 'ASSET', balance: 1000000 },
]

const mockBudgets = [
  {
    id: 'bud-1',
    accountId: 'exp-1',
    year: 2024,
    month: 1,
    amount: '500000',
    account: { name: '식비', code: '501', type: 'EXPENSE' },
  },
]

const mockTransactions = [
  {
    id: 'tx-1',
    entries: [
      {
        amount: '200000',
        debitAccount: { type: 'EXPENSE' },
        debitAccountId: 'exp-1',
        creditAccount: { type: 'ASSET' },
        creditAccountId: 'asset-1',
      },
    ],
  },
]

function mockFetchResponses() {
  vi.mocked(global.fetch).mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    if (url === '/api/accounts') {
      return { ok: true, json: () => Promise.resolve(mockAccounts) } as Response
    }
    if (url.startsWith('/api/budget')) {
      return { ok: true, json: () => Promise.resolve(mockBudgets) } as Response
    }
    if (url.startsWith('/api/transactions')) {
      return { ok: true, json: () => Promise.resolve(mockTransactions) } as Response
    }
    return { ok: true, json: () => Promise.resolve({}) } as Response
  })
}

describe('BudgetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<BudgetPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('예산 관리 페이지를 렌더링한다', async () => {
    mockFetchResponses()
    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('예산 관리')).toBeInTheDocument()
    })

    expect(screen.getByText('총 예산')).toBeInTheDocument()
    expect(screen.getByText('실제 지출')).toBeInTheDocument()
    expect(screen.getByText('남은 예산')).toBeInTheDocument()
  })

  it('비용 계정별 예산을 표시한다', async () => {
    mockFetchResponses()
    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    expect(screen.getByText('교통비')).toBeInTheDocument()
  })

  it('API 에러 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response)

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText(/불러오지 못했습니다/)).toBeInTheDocument()
    })
  })

  it('예산 편집 모드로 전환할 수 있다', async () => {
    mockFetchResponses()
    const user = userEvent.setup()

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    // 예산 버튼 클릭 (예산이 설정된 항목 또는 '설정 없음' 항목)
    const budgetButtons = screen.getAllByRole('button', { name: /예산:/ })
    await user.click(budgetButtons[0])

    expect(screen.getByPlaceholderText('예산 금액')).toBeInTheDocument()
    expect(screen.getByText('저장')).toBeInTheDocument()
    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('예산 편집을 취소할 수 있다', async () => {
    mockFetchResponses()
    const user = userEvent.setup()

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    const budgetButtons = screen.getAllByRole('button', { name: /예산:/ })
    await user.click(budgetButtons[0])

    await user.click(screen.getByText('취소'))
    expect(screen.queryByPlaceholderText('예산 금액')).not.toBeInTheDocument()
  })

  it('비용 계정이 없으면 빈 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url === '/api/accounts') {
        return { ok: true, json: () => Promise.resolve([{ id: 'a1', code: '101', name: '현금', type: 'ASSET', balance: 0 }]) } as Response
      }
      if (url.startsWith('/api/budget')) {
        return { ok: true, json: () => Promise.resolve([]) } as Response
      }
      if (url.startsWith('/api/transactions')) {
        return { ok: true, json: () => Promise.resolve([]) } as Response
      }
      return { ok: true, json: () => Promise.resolve({}) } as Response
    })

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('비용 계정이 없습니다.')).toBeInTheDocument()
    })
  })

  it('예산을 저장할 수 있다', async () => {
    mockFetchResponses()
    const user = userEvent.setup()

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    const budgetButtons = screen.getAllByRole('button', { name: /예산:/ })
    await user.click(budgetButtons[0])

    const input = screen.getByPlaceholderText('예산 금액')
    await user.clear(input)
    await user.type(input, '600000')
    await user.click(screen.getByText('저장'))

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith('/api/budget', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  it('예산 초기화 버튼이 예산이 설정된 항목에 표시된다', async () => {
    mockFetchResponses()

    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('식비')).toBeInTheDocument()
    })

    expect(screen.getByText('초기화')).toBeInTheDocument()
  })

  it('예산을 초기화할 수 있다', async () => {
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)

    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const method = (init?.method || 'GET').toUpperCase()
      if (url === '/api/accounts') {
        return { ok: true, json: () => Promise.resolve(mockAccounts) } as Response
      }
      if (url.startsWith('/api/budget/') && method === 'DELETE') {
        return { ok: true, json: () => Promise.resolve({ message: '삭제되었습니다.' }) } as Response
      }
      if (url.startsWith('/api/budget')) {
        return { ok: true, json: () => Promise.resolve(mockBudgets) } as Response
      }
      if (url.startsWith('/api/transactions')) {
        return { ok: true, json: () => Promise.resolve(mockTransactions) } as Response
      }
      return { ok: true, json: () => Promise.resolve({}) } as Response
    })

    const user = userEvent.setup()
    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('초기화')).toBeInTheDocument()
    })

    await user.click(screen.getByText('초기화'))

    expect(window.confirm).toHaveBeenCalledWith('이 예산을 초기화하시겠습니까?')

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/budget/bud-1',
        { method: 'DELETE' },
      )
    })

    window.confirm = originalConfirm
  })

  it('예산 초기화 취소 시 API를 호출하지 않는다', async () => {
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => false)
    mockFetchResponses()

    const user = userEvent.setup()
    render(<BudgetPage />)

    await waitFor(() => {
      expect(screen.getByText('초기화')).toBeInTheDocument()
    })

    await user.click(screen.getByText('초기화'))

    const deleteCalls = vi.mocked(global.fetch).mock.calls.filter(([url, options]) => {
      return String(url).startsWith('/api/budget/') && options?.method === 'DELETE'
    })
    expect(deleteCalls).toHaveLength(0)

    window.confirm = originalConfirm
  })
})
