import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SettingsPage from '@/app/(dashboard)/settings/page'

const originalFetch = global.fetch

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('로딩 중 상태를 표시한다', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<SettingsPage />)
    expect(screen.getByText('로딩 중...')).toBeInTheDocument()
  })

  it('현재 설정된 기본 통화를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ currency: 'USD' }),
    } as Response)

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('USD')
  })

  it('기본 통화를 변경하고 저장할 수 있다', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        return { ok: true, json: () => Promise.resolve({ currency: 'KRW' }) } as Response
      }
      return { ok: true, json: () => Promise.resolve({ currency: 'USD' }) } as Response
    })

    const user = userEvent.setup()
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'USD')

    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.getByText('기본 통화가 저장되었습니다.')).toBeInTheDocument()
    })

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ currency: 'USD' }),
      }),
    )
  })

  it('저장 실패 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        return { ok: true, json: () => Promise.resolve({ currency: 'KRW' }) } as Response
      }
      return { ok: false, json: () => Promise.resolve({ error: '저장에 실패했습니다.' }) } as Response
    })

    const user = userEvent.setup()
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.getByText('저장에 실패했습니다.')).toBeInTheDocument()
    })
  })

  it('API 로드 실패 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response)

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정을 불러오지 못했습니다.')).toBeInTheDocument()
    })
  })

  it('네트워크 에러 시 에러 메시지를 표시한다', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        return { ok: true, json: () => Promise.resolve({ currency: 'KRW' }) } as Response
      }
      throw new TypeError('Failed to fetch')
    })

    const user = userEvent.setup()
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.getByText('네트워크 오류가 발생했습니다.')).toBeInTheDocument()
    })
  })

  it('지원하는 모든 통화 옵션을 표시한다', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ currency: 'KRW' }),
    } as Response)

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('설정')).toBeInTheDocument()
    })

    expect(screen.getByText(/KRW - 한국 원/)).toBeInTheDocument()
    expect(screen.getByText(/USD - 미국 달러/)).toBeInTheDocument()
    expect(screen.getByText(/EUR - 유로/)).toBeInTheDocument()
    expect(screen.getByText(/JPY - 일본 엔/)).toBeInTheDocument()
  })
})
