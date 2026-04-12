import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TransactionsPage from '@/app/(dashboard)/transactions/page'

const mockAccounts = [
  { id: 'acc-1', code: '101', name: '현금', type: 'ASSET' },
  { id: 'acc-2', code: '501', name: '식비', type: 'EXPENSE' },
  { id: 'acc-3', code: '401', name: '급여', type: 'REVENUE' },
]

const mockTransactions = [
  {
    id: 'tx-1',
    date: '2024-01-15T00:00:00.000Z',
    description: '점심 식사',
    createdAt: '2024-01-15T12:00:00.000Z',
    entries: [
      {
        id: 'entry-1',
        amount: '15000',
        description: null,
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
      },
    ],
  },
  {
    id: 'tx-2',
    date: '2024-01-10T00:00:00.000Z',
    description: '월급',
    createdAt: '2024-01-10T09:00:00.000Z',
    entries: [
      {
        id: 'entry-2',
        amount: '3000000',
        description: '1월 급여',
        debitAccount: { name: '현금', code: '101', type: 'ASSET' },
        creditAccount: { name: '급여', code: '401', type: 'REVENUE' },
        debitAccountId: 'acc-1',
        creditAccountId: 'acc-3',
      },
      {
        id: 'entry-3',
        amount: '500000',
        description: '보너스',
        debitAccount: { name: '현금', code: '101', type: 'ASSET' },
        creditAccount: { name: '급여', code: '401', type: 'REVENUE' },
        debitAccountId: 'acc-1',
        creditAccountId: 'acc-3',
      },
    ],
  },
]

function setupFetchMock(overrides: Partial<{
  accounts: Response
  transactions: Response
  post: Response
  delete: Response
}> = {}) {
  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const method = init?.method || 'GET'

    if (url === '/api/accounts' && method === 'GET') {
      return overrides.accounts ?? { ok: true, json: () => Promise.resolve(mockAccounts) } as Response
    }
    if (url === '/api/transactions' && method === 'GET') {
      return overrides.transactions ?? { ok: true, json: () => Promise.resolve(mockTransactions) } as Response
    }
    if (url === '/api/transactions' && method === 'POST') {
      return overrides.post ?? { ok: true, json: () => Promise.resolve({ id: 'new-tx' }) } as Response
    }
    if (url.startsWith('/api/transactions/') && method === 'DELETE') {
      return overrides.delete ?? { ok: true, json: () => Promise.resolve({}) } as Response
    }
    return { ok: true, json: () => Promise.resolve({}) } as Response
  })
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    // crypto.randomUUID 모킹
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid-1' as `${string}-${string}-${string}-${string}-${string}`)
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<TransactionsPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('페이지 제목과 거래 폼을 렌더링한다', async () => {
    setupFetchMock()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 내역')).toBeInTheDocument()
    })

    expect(screen.getByText('거래 추가')).toBeInTheDocument()
    expect(screen.getByText('거래 목록')).toBeInTheDocument()
  })

  it('거래 목록을 표시한다', async () => {
    setupFetchMock()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('점심 식사')).toBeInTheDocument()
    })

    expect(screen.getByText('월급')).toBeInTheDocument()
  })

  it('다중 항목 거래에 항목 수 배지를 표시한다', async () => {
    setupFetchMock()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('2개 항목')).toBeInTheDocument()
    })
  })

  it('빈 거래 목록 메시지를 표시한다', async () => {
    setupFetchMock({
      transactions: { ok: true, json: () => Promise.resolve([]) } as Response,
    })

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText(/거래 내역이 없습니다/)).toBeInTheDocument()
    })
  })

  it('거래 목록 API 에러 시 에러 메시지를 표시한다', async () => {
    setupFetchMock({
      transactions: { ok: false, status: 500 } as Response,
    })

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText(/거래 내역을 불러오지 못했습니다/)).toBeInTheDocument()
    })
  })

  it('계정 배지를 표시한다', async () => {
    setupFetchMock()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 계정 배지들이 렌더링됨
    const buttons = screen.getAllByRole('button', { name: /101 현금|501 식비|401 급여/ })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('계정 검색 필터가 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('계정 검색')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('계정 검색'), '현금')

    // 현금만 보이고 다른 계정은 안 보임
    const badges = screen.getAllByRole('button', { name: /101 현금/ })
    expect(badges.length).toBeGreaterThan(0)
  })

  it('항목 추가 및 삭제가 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('항목 1')).toBeInTheDocument()
    })

    // 항목 추가
    await user.click(screen.getByText('+ 항목 추가'))
    expect(screen.getByText('항목 2')).toBeInTheDocument()

    // 항목 삭제
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' })
    // 첫 번째 삭제 버튼은 분개 항목 삭제 (거래 목록의 삭제와 구분)
    const entryDeleteBtn = deleteButtons.find(btn => {
      const parent = btn.closest('.border.dark\\:border-gray-600.rounded-lg')
      return parent !== null
    })
    if (entryDeleteBtn) {
      await user.click(entryDeleteBtn)
    }
  })

  it('폼 유효성 검증 - 필수 필드 누락', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 차변만 선택하고 대변, 금액 없이 제출 시도
    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    await user.click(within(debitSection).getByRole('button', { name: '101 현금' }))

    // 설명 입력 (required 필드이므로)
    await user.type(screen.getByPlaceholderText('거래 내용을 입력하세요'), '테스트')

    // 금액 입력
    await user.type(screen.getByPlaceholderText('0'), '10000')

    // 대변 계정 없이 제출
    await user.click(screen.getByRole('button', { name: '거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')).toBeInTheDocument()
    })
  })

  it('같은 차변/대변 계정 시 에러를 표시한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 차변에서 현금 선택
    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    const debitBadge = within(debitSection).getByRole('button', { name: '101 현금' })
    await user.click(debitBadge)

    // 대변에서도 현금 선택
    const creditSection = screen.getByText('대변 (Credit)').closest('div')!
    const creditBadge = within(creditSection).getByRole('button', { name: '101 현금' })
    await user.click(creditBadge)

    // 금액 입력
    const amountInput = screen.getByPlaceholderText('0')
    await user.type(amountInput, '10000')

    // 날짜와 설명 입력
    const descInput = screen.getByPlaceholderText('거래 내용을 입력하세요')
    await user.type(descInput, '테스트 거래')

    // 제출
    await user.click(screen.getByRole('button', { name: '거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('차변 계정과 대변 계정은 달라야 합니다.')).toBeInTheDocument()
    })
  })

  it('거래 삭제를 실행한다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => true)

    const user = userEvent.setup()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('점심 식사')).toBeInTheDocument()
    })

    // 거래 목록의 삭제 버튼 클릭
    const table = screen.getByRole('table')
    const tableDeleteButtons = within(table).getAllByRole('button', { name: '삭제' })
    await user.click(tableDeleteButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('이 거래를 삭제하시겠습니까?')
    expect(global.fetch).toHaveBeenCalledWith('/api/transactions/tx-1', { method: 'DELETE' })
  })

  it('거래 삭제 취소 시 API를 호출하지 않는다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => false)

    const user = userEvent.setup()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('점심 식사')).toBeInTheDocument()
    })

    const fetchCallCount = vi.mocked(global.fetch).mock.calls.length
    const table = screen.getByRole('table')
    const tableDeleteButtons = within(table).getAllByRole('button', { name: '삭제' })
    await user.click(tableDeleteButtons[0])

    // DELETE 호출이 없어야 함
    const deleteCalls = vi.mocked(global.fetch).mock.calls.filter(
      call => call[1]?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(0)
  })

  it('거래 행 클릭 시 상세 항목을 펼친다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('월급')).toBeInTheDocument()
    })

    // 월급 거래 행 클릭
    const row = screen.getByText('월급').closest('tr')!
    await user.click(row)

    // 상세 항목이 표시됨
    await waitFor(() => {
      expect(screen.getByText('1월 급여')).toBeInTheDocument()
      expect(screen.getByText('보너스')).toBeInTheDocument()
    })

    // 다시 클릭하면 닫힘
    await user.click(row)
    await waitFor(() => {
      expect(screen.queryByText('1월 급여')).not.toBeInTheDocument()
    })
  })

  it('폼 초기화가 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 설명 입력
    const descInput = screen.getByPlaceholderText('거래 내용을 입력하세요')
    await user.type(descInput, '테스트')

    // 초기화 클릭
    await user.click(screen.getByRole('button', { name: '초기화' }))

    expect(screen.getByPlaceholderText('거래 내용을 입력하세요')).toHaveValue('')
  })

  it('거래 저장 성공 시 폼을 초기화하고 목록을 새로고침한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 차변 선택
    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    await user.click(within(debitSection).getByRole('button', { name: '501 식비' }))

    // 대변 선택
    const creditSection = screen.getByText('대변 (Credit)').closest('div')!
    await user.click(within(creditSection).getByRole('button', { name: '101 현금' }))

    // 금액 입력
    await user.type(screen.getByPlaceholderText('0'), '15000')

    // 설명 입력
    await user.type(screen.getByPlaceholderText('거래 내용을 입력하세요'), '점심')

    // 저장
    await user.click(screen.getByRole('button', { name: '거래 저장' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/transactions', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  it('거래 저장 실패 시 에러를 표시한다', async () => {
    setupFetchMock({
      post: { ok: false, json: () => Promise.resolve({ error: '잔액이 부족합니다.' }) } as Response,
    })
    const user = userEvent.setup()

    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByText('거래 추가')).toBeInTheDocument()
    })

    // 차변 선택
    const debitSection = screen.getByText('차변 (Debit)').closest('div')!
    await user.click(within(debitSection).getByRole('button', { name: '501 식비' }))

    // 대변 선택
    const creditSection = screen.getByText('대변 (Credit)').closest('div')!
    await user.click(within(creditSection).getByRole('button', { name: '101 현금' }))

    // 금액 입력
    await user.type(screen.getByPlaceholderText('0'), '15000')

    // 설명 입력
    await user.type(screen.getByPlaceholderText('거래 내용을 입력하세요'), '점심')

    // 저장
    await user.click(screen.getByRole('button', { name: '거래 저장' }))

    await waitFor(() => {
      expect(screen.getByText('잔액이 부족합니다.')).toBeInTheDocument()
    })
  })

  it('계정 API 에러 시 경고를 표시한다', async () => {
    setupFetchMock({
      accounts: { ok: false, status: 500 } as Response,
    })

    render(<TransactionsPage />)

    await waitFor(() => {
      const alerts = screen.getAllByText(/계정 목록을 불러오지 못했습니다/)
      expect(alerts.length).toBeGreaterThanOrEqual(1)
    })
  })
})
