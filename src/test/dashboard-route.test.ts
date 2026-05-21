import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireUser, mockGetDashboardData, mockSerializeData } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockSerializeData: vi.fn((data: unknown) => data),
}))

vi.mock('@/lib/auth', () => {
  class MockAuthenticationError extends Error {
    constructor(message = '인증이 필요합니다.') {
      super(message)
      this.name = 'AuthenticationError'
    }
  }

  return {
    AuthenticationError: MockAuthenticationError,
    requireUser: mockRequireUser,
  }
})

vi.mock('@/lib/dashboard', () => ({
  getDashboardData: mockGetDashboardData,
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: mockSerializeData,
}))

import { AuthenticationError } from '@/lib/auth'
import { GET } from '@/app/api/dashboard/route'

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUser.mockResolvedValue({ id: 'user-1' })
    mockGetDashboardData.mockResolvedValue({ totalAssets: 1000 })
  })

  it('인증 실패 시 401을 반환한다', async () => {
    mockRequireUser.mockRejectedValue(new AuthenticationError())

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('인증이 필요합니다.')
  })

  it('예상하지 못한 오류가 발생하면 500을 반환한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockGetDashboardData.mockRejectedValue(new Error('boom'))

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('대시보드 데이터를 불러오지 못했습니다.')
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('대시보드 데이터를 직렬화해 반환한다', async () => {
    mockSerializeData.mockReturnValue({ totalAssets: 1000 })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockRequireUser).toHaveBeenCalledWith({ onUnauthenticated: 'throw' })
    expect(mockGetDashboardData).toHaveBeenCalledWith('user-1')
    expect(mockSerializeData).toHaveBeenCalledWith({ totalAssets: 1000 })
    expect(body).toEqual({ totalAssets: 1000 })
  })
})
