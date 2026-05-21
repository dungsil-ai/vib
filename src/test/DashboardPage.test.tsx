import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockData = {
  totalAssets: 5000000,
  totalLiabilities: 1000000,
  totalEquity: 4000000,
  netWorth: 4000000,
  baseCurrency: 'KRW',
  recentTransactions: [],
  budgetOverview: [],
}

vi.mock('@/lib/dashboard', () => ({
  getDashboardData: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor(message = '인증이 필요합니다.') {
      super(message)
      this.name = 'AuthRequiredError'
    }
  },
}))

import { GET } from '@/app/api/dashboard/route'
import { AuthRequiredError, getDashboardData } from '@/lib/dashboard'

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('대시보드 데이터를 반환한다', async () => {
    vi.mocked(getDashboardData).mockResolvedValue(mockData as never)

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      totalAssets: 5000000,
      baseCurrency: 'KRW',
    })
  })

  it('인증 실패 시 401을 반환한다', async () => {
    vi.mocked(getDashboardData).mockRejectedValue(new AuthRequiredError())

    const res = await GET()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: '인증이 필요합니다.' })
  })
})
