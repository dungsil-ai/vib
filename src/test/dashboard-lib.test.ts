import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { AuthRequiredError, getDashboardData } from '@/lib/dashboard'

function collectDates(value: unknown): Date[] {
  if (value instanceof Date) return [value]
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectDates)
  return Object.values(value as Record<string, unknown>).flatMap(collectDates)
}

describe('getDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'))

    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{
      id: 'tx-1',
      date: new Date('2026-05-20T00:00:00.000Z'),
      description: '점심',
      entries: [{
        amount: 100,
        currency: 'KRW',
        exchangeRate: 1,
        debitAccount: { id: 'expense-1', name: '식비', code: '5001' },
        creditAccount: { id: 'cash-1', name: '현금', code: '1001' },
      }],
    }] as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('미인증 사용자면 AuthRequiredError를 던진다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    await expect(getDashboardData()).rejects.toBeInstanceOf(AuthRequiredError)
  })

  it('합계/예산/최근거래를 집계하고 월 범위를 UTC 기준으로 사용한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', type: 'ASSET' },
      { id: 'liability-1', type: 'LIABILITY' },
      { id: 'equity-1', type: 'EQUITY' },
      { id: 'expense-1', type: 'EXPENSE' },
    ] as never)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        { debitAccountId: 'asset-1', total: '1000' },
        { debitAccountId: 'liability-1', total: '100' },
        { debitAccountId: 'equity-1', total: '50' },
        { debitAccountId: 'expense-1', total: '300' },
      ] as never)
      .mockResolvedValueOnce([
        { creditAccountId: 'asset-1', total: '200' },
        { creditAccountId: 'liability-1', total: '500' },
        { creditAccountId: 'equity-1', total: '700' },
      ] as never)
      .mockResolvedValueOnce([
        { debitAccountId: 'expense-1', total: '250' },
      ] as never)
    vi.mocked(prisma.budget.findMany).mockResolvedValue([{
      accountId: 'expense-1',
      amount: 1000,
      account: { name: '식비', code: '5001' },
    }] as never)

    const result = await getDashboardData()

    expect(result.totalAssets).toBe(800)
    expect(result.totalLiabilities).toBe(400)
    expect(result.totalEquity).toBe(650)
    expect(result.netWorth).toBe(400)
    expect(result.budgetOverview).toEqual([{
      accountId: 'expense-1',
      name: '식비',
      code: '5001',
      budget: 1000,
      actual: 250,
    }])
    expect(result.recentTransactions).toHaveLength(1)

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3)
    const monthlyExpenseCall = vi.mocked(prisma.$queryRaw).mock.calls[2]
    const dates = monthlyExpenseCall.flatMap(collectDates)
    expect(dates).toContainEqual(new Date('2026-05-01T00:00:00.000Z'))
    expect(dates).toContainEqual(new Date('2026-05-31T23:59:59.999Z'))
  })

  it('비용 계정이 없으면 월간 비용 쿼리를 생략한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', type: 'ASSET' },
      { id: 'liability-1', type: 'LIABILITY' },
    ] as never)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ debitAccountId: 'asset-1', total: '10' }] as never)
      .mockResolvedValueOnce([{ creditAccountId: 'liability-1', total: '3' }] as never)
    vi.mocked(prisma.budget.findMany).mockResolvedValue([] as never)

    const result = await getDashboardData()

    expect(result.budgetOverview).toEqual([])
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
  })
})
