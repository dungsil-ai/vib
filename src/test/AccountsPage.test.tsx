import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
}))

import AccountsPage from '@/app/(dashboard)/accounts/page'

const mockAccounts = [
  { id: '1', code: '101', name: '현금', type: 'ASSET', description: '현금 자산', balance: 1000000 },
  { id: '2', code: '201', name: '카드대금', type: 'LIABILITY', description: null, balance: 500000 },
  { id: '3', code: '301', name: '자본금', type: 'EQUITY', description: null, balance: 2000000 },
  { id: '4', code: '501', name: '식비', type: 'EXPENSE', description: '식사 비용', balance: 300000 },
  { id: '5', code: '401', name: '급여', type: 'REVENUE', description: null, balance: 3000000 },
]

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<AccountsPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('계정 목록을 유형별로 그룹화하여 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    } as Response)

    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('계정 관리')).toBeInTheDocument()
    })

    expect(screen.getByText('현금')).toBeInTheDocument()
    expect(screen.getByText('카드대금')).toBeInTheDocument()
    expect(screen.getByText('식비')).toBeInTheDocument()
    expect(screen.getByText('급여')).toBeInTheDocument()
  })

  it('API 에러 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: '서버 오류' }),
    } as Response)

    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('서버 오류')).toBeInTheDocument()
    })
  })

  it('계정 추가 폼을 열고 닫을 수 있다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response)

    const user = userEvent.setup()
    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('계정 관리')).toBeInTheDocument()
    })

    const addButtons = screen.getAllByText('+ 계정 추가')
    await user.click(addButtons[0])

    expect(screen.getByPlaceholderText('예: 현금')).toBeInTheDocument()

    await user.click(screen.getByText('취소'))
    expect(screen.queryByPlaceholderText('예: 현금')).not.toBeInTheDocument()
  })

  it('새 계정을 추가할 수 있다', async () => {
    let callCount = 0
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url === '/api/accounts' && callCount++ === 0) {
        return { ok: true, json: () => Promise.resolve([]) } as Response
      }
      if (url === '/api/accounts') {
        return {
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 'new', code: '101', name: '현금', type: 'ASSET', description: '', balance: 0 },
            ]),
        } as Response
      }
      return { ok: true, json: () => Promise.resolve({}) } as Response
    })

    const user = userEvent.setup()
    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('계정 관리')).toBeInTheDocument()
    })

    const addButtons = screen.getAllByText('+ 계정 추가')
    await user.click(addButtons[0])

    await user.type(screen.getByPlaceholderText('예: 현금'), '현금')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith('/api/accounts', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  it('계정 추가 실패 시 에러를 표시한다', async () => {
    let callCount = 0
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const method = init?.method || 'GET'
      if (url === '/api/accounts' && method === 'GET') {
        callCount++
        return { ok: true, json: () => Promise.resolve([]) } as Response
      }
      if (url === '/api/accounts' && method === 'POST') {
        return {
          ok: false,
          json: () => Promise.resolve({ error: '중복된 계정명입니다.' }),
        } as Response
      }
      return { ok: true, json: () => Promise.resolve({}) } as Response
    })

    const user = userEvent.setup()
    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('계정 관리')).toBeInTheDocument()
    })

    const addButtons = screen.getAllByText('+ 계정 추가')
    await user.click(addButtons[0])

    await user.type(screen.getByPlaceholderText('예: 현금'), '현금')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.getByText('중복된 계정명입니다.')).toBeInTheDocument()
    })
  })

  it('계정을 삭제할 수 있다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    } as Response)

    window.confirm = vi.fn(() => true)
    const user = userEvent.setup()

    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('현금')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('삭제')
    await user.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('이 계정을 삭제하시겠습니까?')
  })

  it('삭제 취소 시 API를 호출하지 않는다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    } as Response)

    window.confirm = vi.fn(() => false)
    const user = userEvent.setup()

    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('현금')).toBeInTheDocument()
    })

    const fetchCallCount = vi.mocked(global.fetch).mock.calls.length
    const deleteButtons = screen.getAllByText('삭제')
    await user.click(deleteButtons[0])

    // 추가적인 fetch 호출이 없어야 함
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallCount)
  })

  it('네트워크 에러 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<AccountsPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
    })
  })
})
