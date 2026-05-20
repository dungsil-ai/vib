import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { getBaseCurrencyEntrySumMap } from './report-sums'

function sqlFragments(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []

  if (Array.isArray(value) && value.every(fragment => typeof fragment === 'string')) {
    return value
  }

  const maybeSql = value as { strings?: unknown }
  if (Array.isArray(maybeSql.strings)) {
    return maybeSql.strings.filter((fragment): fragment is string => typeof fragment === 'string')
  }

  return []
}

function sqlValues<T>(value: unknown): T[] {
  if (!value || typeof value !== 'object') return []

  const maybeSql = value as { values?: unknown }
  if (Array.isArray(maybeSql.values)) {
    return maybeSql.values as T[]
  }

  return []
}

describe('getBaseCurrencyEntrySumMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('계정 ID가 없으면 쿼리하지 않고 빈 Map을 반환한다', async () => {
    const result = await getBaseCurrencyEntrySumMap({
      accountIds: [],
      userId: 'user-1',
      side: 'debit',
    })

    expect(result.size).toBe(0)
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('차변 계정의 원화 환산 합계를 숫자 Map으로 반환한다', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { accountId: 'asset-1', total: '130000' },
      { accountId: 'asset-2', total: null },
    ])

    const result = await getBaseCurrencyEntrySumMap({
      accountIds: ['asset-1', 'asset-2'],
      userId: 'user-1',
      side: 'debit',
    })

    expect(result).toEqual(new Map([
      ['asset-1', 130000],
      ['asset-2', 0],
    ]))
    expect(prisma.$queryRaw).toHaveBeenCalledOnce()

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0]
    const sql = call.flatMap(sqlFragments).join('')
    expect(sql).toContain('e."debitAccountId"')
    expect(sql).toContain('SUM(e.amount * e."exchangeRate")::text')
  })

  it('대변 계정과 시작/종료일 필터를 raw SQL 파라미터로 전달한다', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { accountId: 'revenue-1', total: '260000' },
    ])
    const startDate = new Date('2024-01-01T00:00:00.000Z')
    const endDate = new Date('2024-01-31T23:59:59.999Z')

    const result = await getBaseCurrencyEntrySumMap({
      accountIds: ['revenue-1'],
      userId: 'user-1',
      side: 'credit',
      dateFilter: { gte: startDate, lte: endDate },
    })

    expect(result.get('revenue-1')).toBe(260000)

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0]
    const sql = call.flatMap(sqlFragments).join('')
    const dates = call.flatMap(item => sqlValues<Date>(item))

    expect(sql).toContain('e."creditAccountId"')
    expect(dates).toContain(startDate)
    expect(dates).toContain(endDate)
  })

  it('미만 날짜 필터를 raw SQL 파라미터로 전달한다', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const beforeDate = new Date('2024-02-01T00:00:00.000Z')

    const result = await getBaseCurrencyEntrySumMap({
      accountIds: ['asset-1'],
      userId: 'user-1',
      side: 'debit',
      dateFilter: { lt: beforeDate },
    })

    expect(result.size).toBe(0)
    const dates = vi.mocked(prisma.$queryRaw).mock.calls[0].flatMap(item => sqlValues<Date>(item))
    expect(dates).toContain(beforeDate)
  })
})
