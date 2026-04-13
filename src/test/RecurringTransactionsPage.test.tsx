import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import RecurringTransactionsPage from '@/app/(dashboard)/recurring-transactions/page'

const originalFetch = global.fetch
const originalConfirm = window.confirm

const mockAccounts = [
  { id: 'acc-1', code: '101', name: '현금', type: 'ASSET' },
  { id: 'acc-2', code: '501', name: '식비', type: 'EXPENSE' },
  { id: 'acc-3', code: '401', name: '급여', type: 'REVENUE' },
]

const mockRecurring = [
  {
    id: 'rec-1',
    description: '월세',
    frequency: 'MONTHLY',
    dayOfMonth: 25,
    monthOfYear: null,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: null,
    nextRunAt: '2024-02-25T00:00:00.000Z',
    lastRunAt: '2024-01-25T00:00:00.000Z',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'rentry-1',
        amount: '500000',
        description: null,
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
      },
    ],
  },
  {
    id: 'rec-2',
    description: '통신비',
    frequency: 'MONTHLY',
    dayOfMonth: 10,
    monthOfYear: null,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: null,
    nextRunAt: '2024-02-10T00:00:00.000Z',
    lastRunAt: null,
    isActive: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'rentry-2',
        amount: '55000',
        description: '인터넷',
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
      },
      {
        id: 'rentry-3',
        amount: '45000',
        description: '휴대폰',
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
      },
    ],
  },
]

function setupFetchMock(overrides: Partial<{
  accounts: Response
  recurring: Response
  post: Response
  put: Response
  delete: Response
  generate: Response
}> = {}) {
  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const method = init?.method || 'GET'

    if (url === '/api/accounts' && method === 'GET') {
      return overrides.accounts ?? { ok: true, json: () => Promise.resolve(mockAccounts) } as Response
    }
    if (url === '/api/recurring-transactions' && method === 'GET') {
      return overrides.recurring ?? { ok: true, json: () => Promise.resolve(mockRecurring) } as Response
    }
    if (url === '/api/recurring-transactions' && method === 'POST') {
      return overrides.post ?? { ok: true, json: () => Promise.resolve({ id: 'new-rec' }) } as Response
    }
    if (url.startsWith('/api/recurring-transactions/generate') && method === 'POST') {
      return overrides.generate ?? { ok: true, json: () => Promise.resolve({ generated: 1, transactions: [] }) } as Response
    }
    if (url.startsWith('/api/recurring-transactions/') && method === 'PUT') {
      return overrides.put ?? { ok: true, json: () => Promise.resolve({ id: 'rec-1', isActive: false }) } as Response
    }
    if (url.startsWith('/api/recurring-transactions/') && method === 'DELETE') {
      return overrides.delete ?? { ok: true, json: () => Promise.resolve({}) } as Response
    }
    return { ok: true, json: () => Promise.resolve({}) } as Response
  })
}

describe('RecurringTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    let uuidCounter = 0
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `mock-uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
    window.confirm = originalConfirm
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<RecurringTransactionsPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('페이지 제목과 폼을 렌더링한다', async () => {
    setupFetchMock()
    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래')).toBeInTheDocument()
    })

    expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    expect(screen.getByText('반복 거래 목록')).toBeInTheDocument()
  })

  it('반복 거래 목록을 표시한다', async () => {
    setupFetchMock()
    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('월세')).toBeInTheDocument()
    })

    expect(screen.getByText('통신비')).toBeInTheDocument()
  })

  it('다중 항목 거래에 항목 수 배지를 표시한다', async () => {
    setupFetchMock()
    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('2개 항목')).toBeInTheDocument()
    })
  })

  it('활성/비활성 상태를 표시한다', async () => {
    setupFetchMock()
    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '비활성화' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '활성화' })).toBeInTheDocument()
    })
  })

  it('빈 반복 거래 목록 메시지를 표시한다', async () => {
    setupFetchMock({
      recurring: { ok: true, json: () => Promise.resolve([]) } as Response,
    })

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText(/등록된 반복 거래가 없습니다/)).toBeInTheDocument()
    })
  })

  it('반복 거래 목록 API 에러 시 에러 메시지를 표시한다', async () => {
    setupFetchMock({
      recurring: { ok: false, status: 500 } as Response,
    })

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText(/반복 거래를 불러오지 못했습니다/)).toBeInTheDocument()
    })
  })

  it('반복 거래 행 클릭 시 상세 항목을 펼친다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('통신비')).toBeInTheDocument()
    })

    const row = screen.getByText('통신비').closest('tr')!
    await user.click(row)

    await waitFor(() => {
      expect(screen.getByText('인터넷')).toBeInTheDocument()
      expect(screen.getByText('휴대폰')).toBeInTheDocument()
    })

    await user.click(row)
    await waitFor(() => {
      expect(screen.queryByText('인터넷')).not.toBeInTheDocument()
    })
  })

  it('활성/비활성 토글이 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '비활성화' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '비활성화' }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/recurring-transactions/rec-1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('반복 거래 삭제가 동작한다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => true)
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('월세')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const deleteButtons = within(table).getAllByRole('button', { name: '삭제' })
    await user.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('이 반복 거래를 삭제하시겠습니까?')
    expect(global.fetch).toHaveBeenCalledWith('/api/recurring-transactions/rec-1', { method: 'DELETE' })
  })

  it('반복 거래 삭제 취소 시 API를 호출하지 않는다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => false)
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('월세')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const deleteButtons = within(table).getAllByRole('button', { name: '삭제' })
    await user.click(deleteButtons[0])

    const deleteCalls = vi.mocked(global.fetch).mock.calls.filter(
      call => call[1]?.method === 'DELETE',
    )
    expect(deleteCalls.length).toBe(0)
  })

  it('자동 생성 버튼이 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '지금 자동 생성' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '지금 자동 생성' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/recurring-transactions/generate',
        { method: 'POST' },
      )
    })

    await waitFor(() => {
      expect(screen.getByText('1건의 거래가 자동 생성되었습니다.')).toBeInTheDocument()
    })
  })

  it('폼 유효성 검증 - 필수 필드 누락', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    })

    // 차변만 선택하고 대변 없이 제출
    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    const debitAccountButton = await within(debitSection).findByRole('button', { name: '101 현금' })
    await user.click(debitAccountButton)

    await user.type(screen.getByPlaceholderText('예: 월세, 통신비, 월급'), '월세')
    await user.type(screen.getByPlaceholderText('0'), '500000')

    await user.click(screen.getByRole('button', { name: '반복 거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')).toBeInTheDocument()
    })
  })

  it('같은 차변/대변 계정 시 에러를 표시한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    })

    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    await user.click(await within(debitSection).findByRole('button', { name: '101 현금' }))

    const creditSection = screen.getByText('대변 (Credit)').closest('div')!
    await user.click(await within(creditSection).findByRole('button', { name: '101 현금' }))

    await user.type(screen.getByPlaceholderText('0'), '10000')
    await user.type(screen.getByPlaceholderText('예: 월세, 통신비, 월급'), '테스트')

    await user.click(screen.getByRole('button', { name: '반복 거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('차변 계정과 대변 계정은 달라야 합니다.')).toBeInTheDocument()
    })
  })

  it('폼 초기화가 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    })

    const descInput = screen.getByPlaceholderText('예: 월세, 통신비, 월급')
    await user.type(descInput, '테스트')

    await user.click(screen.getByRole('button', { name: '초기화' }))

    expect(screen.getByPlaceholderText('예: 월세, 통신비, 월급')).toHaveValue('')
  })

  it('반복 거래 저장 성공 시 폼을 초기화하고 목록을 새로고침한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    })

    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    const creditSection = screen.getByText('대변 (Credit)').closest('div')!

    await waitFor(() => {
      expect(within(debitSection).getByRole('button', { name: '501 식비' })).toBeInTheDocument()
      expect(within(creditSection).getByRole('button', { name: '101 현금' })).toBeInTheDocument()
    })

    await user.click(within(debitSection).getByRole('button', { name: '501 식비' }))
    await user.click(within(creditSection).getByRole('button', { name: '101 현금' }))
    await user.type(screen.getByPlaceholderText('0'), '500000')
    await user.type(screen.getByPlaceholderText('예: 월세, 통신비, 월급'), '월세')

    await user.click(screen.getByRole('button', { name: '반복 거래 저장' }))

    await waitFor(() => {
      const postCalls = vi.mocked(global.fetch).mock.calls.filter(
        ([url, opts]) => url === '/api/recurring-transactions' && (opts as RequestInit | undefined)?.method === 'POST',
      )
      expect(postCalls).toHaveLength(1)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('예: 월세, 통신비, 월급')).toHaveValue('')
    })
  })

  it('반복 거래 저장 실패 시 에러를 표시한다', async () => {
    setupFetchMock({
      post: { ok: false, json: () => Promise.resolve({ error: '잘못된 계정입니다.' }) } as Response,
    })
    const user = userEvent.setup()

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('반복 거래 추가')).toBeInTheDocument()
    })

    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    await user.click(await within(debitSection).findByRole('button', { name: '501 식비' }))

    const creditSection = screen.getByText('대변 (Credit)').closest('div')!
    await user.click(await within(creditSection).findByRole('button', { name: '101 현금' }))

    await user.type(screen.getByPlaceholderText('0'), '500000')
    await user.type(screen.getByPlaceholderText('예: 월세, 통신비, 월급'), '월세')

    await user.click(screen.getByRole('button', { name: '반복 거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('잘못된 계정입니다.')).toBeInTheDocument()
    })
  })

  it('계정 API 에러 시 경고를 표시한다', async () => {
    setupFetchMock({
      accounts: { ok: false, status: 500 } as Response,
    })

    render(<RecurringTransactionsPage />)

    await waitFor(() => {
      const alerts = screen.getAllByText(/계정 목록을 불러오지 못했습니다/)
      expect(alerts.length).toBeGreaterThanOrEqual(1)
    })
  })
})
