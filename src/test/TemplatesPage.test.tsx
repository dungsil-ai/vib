import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TransactionsPage from '@/app/(dashboard)/transactions/page'

const originalFetch = global.fetch
const originalConfirm = window.confirm

const mockAccounts = [
  { id: 'acc-1', code: '101', name: '현금', type: 'ASSET' },
  { id: 'acc-2', code: '501', name: '식비', type: 'EXPENSE' },
]

const mockTemplates = [
  {
    id: 'tmpl-1',
    description: '월세',
    createdAt: '2024-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'tentry-1',
        amount: '500000',
        description: null,
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
      },
    ],
  },
  {
    id: 'tmpl-2',
    description: '통신비',
    createdAt: '2024-01-02T00:00:00.000Z',
    entries: [
      {
        id: 'tentry-2',
        amount: '55000',
        description: '인터넷',
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
      },
      {
        id: 'tentry-3',
        amount: '45000',
        description: '휴대폰',
        debitAccountId: 'acc-2',
        creditAccountId: 'acc-1',
        debitAccount: { name: '식비', code: '501', type: 'EXPENSE' },
        creditAccount: { name: '현금', code: '101', type: 'ASSET' },
      },
    ],
  },
]

function setupFetchMock(overrides: Partial<{
  accounts: Response
  transactions: Response
  recurring: Response
  templates: Response
  postTemplate: Response
  deleteTemplate: Response
  settings: Response
}> = {}) {
  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const method = init?.method || 'GET'

    if (url === '/api/accounts' && method === 'GET') {
      return overrides.accounts ?? { ok: true, json: () => Promise.resolve(mockAccounts) } as Response
    }
    if (url.startsWith('/api/transactions') && !url.includes('/api/transactions/') && method === 'GET') {
      return overrides.transactions ?? {
        ok: true,
        json: () => Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20 }),
      } as Response
    }
    if (url === '/api/recurring-transactions' && method === 'GET') {
      return overrides.recurring ?? { ok: true, json: () => Promise.resolve([]) } as Response
    }
    if (url === '/api/templates' && method === 'GET') {
      return overrides.templates ?? { ok: true, json: () => Promise.resolve(mockTemplates) } as Response
    }
    if (url === '/api/templates' && method === 'POST') {
      return overrides.postTemplate ?? { ok: true, json: () => Promise.resolve({ id: 'new-tmpl' }), status: 201 } as unknown as Response
    }
    if (url.startsWith('/api/templates/') && method === 'DELETE') {
      return overrides.deleteTemplate ?? { ok: true, json: () => Promise.resolve({}) } as Response
    }
    if (url === '/api/settings' && method === 'GET') {
      return overrides.settings ?? { ok: true, json: () => Promise.resolve({ currency: 'KRW' }) } as Response
    }
    return { ok: true, json: () => Promise.resolve({}) } as Response
  })
}

describe('TemplatesTab (템플릿 탭)', () => {
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

  it('템플릿 탭으로 전환하면 폼과 목록을 렌더링한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })
    expect(screen.getByText('템플릿 목록')).toBeInTheDocument()
  })

  it('템플릿 목록을 표시한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('월세')).toBeInTheDocument()
    })
    expect(screen.getByText('통신비')).toBeInTheDocument()
  })

  it('다중 항목 템플릿에 항목 수 배지를 표시한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('2개 항목')).toBeInTheDocument()
    })
  })

  it('빈 템플릿 목록 메시지를 표시한다', async () => {
    setupFetchMock({
      templates: { ok: true, json: () => Promise.resolve([]) } as Response,
    })
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText(/등록된 템플릿이 없습니다/)).toBeInTheDocument()
    })
  })

  it('템플릿 API 에러 시 에러 메시지를 표시한다', async () => {
    setupFetchMock({
      templates: { ok: false, status: 500 } as Response,
    })
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText(/템플릿을 불러오지 못했습니다/)).toBeInTheDocument()
    })
  })

  it('템플릿 행 클릭 시 상세 항목을 펼친다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

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

  it('폼 유효성 검증 - 필수 필드 누락', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })

    const templateForm = screen.getByRole('button', { name: '템플릿 저장' }).closest('form') as HTMLElement
    const debitSection = within(templateForm).getByText('차변 (Debit)').closest('div')!
    await user.click(await within(debitSection).findByRole('button', { name: '101 현금' }))
    await user.type(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출'), '테스트')
    await user.type(within(templateForm).getByPlaceholderText('0'), '100000')

    await user.click(screen.getByRole('button', { name: '템플릿 저장' }))

    await waitFor(() => {
      expect(screen.getByText('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')).toBeInTheDocument()
    })
  })

  it('같은 차변/대변 계정 시 에러를 표시한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })

    const templateForm = screen.getByRole('button', { name: '템플릿 저장' }).closest('form') as HTMLElement
    const debitSection = within(templateForm).getByText('차변 (Debit)').closest('div')!
    await user.click(await within(debitSection).findByRole('button', { name: '101 현금' }))

    const creditSection = within(templateForm).getByText('대변 (Credit)').closest('div')!
    await user.click(await within(creditSection).findByRole('button', { name: '101 현금' }))

    await user.type(within(templateForm).getByPlaceholderText('0'), '10000')
    await user.type(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출'), '테스트')

    await user.click(screen.getByRole('button', { name: '템플릿 저장' }))

    await waitFor(() => {
      expect(screen.getByText('차변 계정과 대변 계정은 달라야 합니다.')).toBeInTheDocument()
    })
  })

  it('템플릿 저장 성공 시 폼을 초기화하고 목록을 새로고침한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })

    const templateForm = screen.getByRole('button', { name: '템플릿 저장' }).closest('form') as HTMLElement
    const debitSection = within(templateForm).getByText('차변 (Debit)').closest('div')!
    const creditSection = within(templateForm).getByText('대변 (Credit)').closest('div')!

    await waitFor(() => {
      expect(within(debitSection).getByRole('button', { name: '501 식비' })).toBeInTheDocument()
      expect(within(creditSection).getByRole('button', { name: '101 현금' })).toBeInTheDocument()
    })

    await user.click(within(debitSection).getByRole('button', { name: '501 식비' }))
    await user.click(within(creditSection).getByRole('button', { name: '101 현금' }))
    await user.type(within(templateForm).getByPlaceholderText('0'), '100000')
    await user.type(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출'), '식비')

    await user.click(screen.getByRole('button', { name: '템플릿 저장' }))

    await waitFor(() => {
      const postCalls = vi.mocked(global.fetch).mock.calls.filter(
        ([url, opts]) => url === '/api/templates' && (opts as RequestInit | undefined)?.method === 'POST',
      )
      expect(postCalls).toHaveLength(1)
    })

    await waitFor(() => {
      expect(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출')).toHaveValue('')
    })
  })

  it('템플릿 저장 실패 시 에러를 표시한다', async () => {
    setupFetchMock({
      postTemplate: { ok: false, json: () => Promise.resolve({ error: '잘못된 계정입니다.' }) } as Response,
    })
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })

    const templateForm = screen.getByRole('button', { name: '템플릿 저장' }).closest('form') as HTMLElement
    const debitSection = within(templateForm).getByText('차변 (Debit)').closest('div')!
    await user.click(await within(debitSection).findByRole('button', { name: '501 식비' }))

    const creditSection = within(templateForm).getByText('대변 (Credit)').closest('div')!
    await user.click(await within(creditSection).findByRole('button', { name: '101 현금' }))

    await user.type(within(templateForm).getByPlaceholderText('0'), '100000')
    await user.type(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출'), '식비')

    await user.click(screen.getByRole('button', { name: '템플릿 저장' }))

    await waitFor(() => {
      expect(screen.getByText('잘못된 계정입니다.')).toBeInTheDocument()
    })
  })

  it('폼 초기화가 동작한다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('템플릿 추가')).toBeInTheDocument()
    })

    const templateForm = screen.getByRole('button', { name: '템플릿 저장' }).closest('form') as HTMLElement
    const descInput = within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출')
    await user.type(descInput, '테스트')

    await user.click(within(templateForm).getByRole('button', { name: '초기화' }))

    expect(within(templateForm).getByPlaceholderText('예: 월세, 통신비, 식비 지출')).toHaveValue('')
  })

  it('템플릿 삭제가 동작한다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => true)
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

    await waitFor(() => {
      expect(screen.getByText('월세')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const deleteButtons = within(table).getAllByRole('button', { name: '삭제' })
    await user.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('이 템플릿을 삭제하시겠습니까?')
    expect(global.fetch).toHaveBeenCalledWith('/api/templates/tmpl-1', { method: 'DELETE' })
  })

  it('템플릿 삭제 취소 시 API를 호출하지 않는다', async () => {
    setupFetchMock()
    window.confirm = vi.fn(() => false)
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await user.click(screen.getByRole('button', { name: '템플릿' }))

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
})

describe('TemplatesTab - 거래 내역 탭에서 템플릿 불러오기', () => {
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

  it('템플릿이 있을 때 거래 내역 탭에 "템플릿 불러오기" 버튼을 표시한다', async () => {
    setupFetchMock()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /템플릿 불러오기/ })).toBeInTheDocument()
    })
  })

  it('"템플릿 불러오기" 클릭 시 드롭다운이 열린다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /템플릿 불러오기/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /템플릿 불러오기/ }))

    expect(screen.getAllByRole('button', { name: '월세' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: '통신비' }).length).toBeGreaterThanOrEqual(1)
  })

  it('드롭다운에서 템플릿 선택 시 거래 설명 필드가 채워진다', async () => {
    setupFetchMock()
    const user = userEvent.setup()
    render(<TransactionsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /템플릿 불러오기/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /템플릿 불러오기/ }))
    await user.click(screen.getAllByRole('button', { name: '월세' })[0])

    const descInput = screen.getByPlaceholderText('거래 내용을 입력하세요')
    expect(descInput).toHaveValue('월세')
  })
})
