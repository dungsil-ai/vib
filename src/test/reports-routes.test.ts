import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── 모킹 ──────────────────────────────────────────────────────────────────

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    entry: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as balanceSheetGET } from '@/app/api/reports/balance-sheet/route'
import { GET as incomeStatementGET } from '@/app/api/reports/income-statement/route'
import { GET as trialBalanceGET } from '@/app/api/reports/trial-balance/route'
import { GET as ledgerGET } from '@/app/api/reports/ledger/route'
import { GET as monthlySummaryGET } from '@/app/api/reports/monthly-summary/route'
import { NextRequest } from 'next/server'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makeRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

function collectDates(value: unknown): Date[] {
  if (value instanceof Date) return [value]
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectDates)
  return Object.values(value as Record<string, unknown>).flatMap(collectDates)
}

// ─── trial-balance endDate 보정 테스트 ─────────────────────────────────────

describe('trial-balance GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
  })

  it('endDate를 UTC 23:59:59.999로 보정해 당일 거래를 포함한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acc-1', code: '1001', name: '현금', type: 'ASSET' },
    ] as never)
    const req = makeRequest('/api/reports/trial-balance', { endDate: '2024-01-15' })
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(200)

    const calls = vi.mocked(prisma.$queryRaw).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const dates = calls.flatMap(call => call.flatMap(collectDates))
    expect(dates.length).toBeGreaterThan(0)
    const whereDate = dates[0]
    expect(whereDate.getHours()).toBe(23)
    expect(whereDate.getMinutes()).toBe(59)
    expect(whereDate.getSeconds()).toBe(59)
    expect(whereDate.getMilliseconds()).toBe(999)
    expect(whereDate.getDate()).toBe(15)
  })

  it('유효하지 않은 endDate에 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/trial-balance', { endDate: 'not-a-date' })
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/endDate/)
  })

  it('startDate > endDate이면 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/trial-balance', {
      startDate: '2024-01-20',
      endDate: '2024-01-10',
    })
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/startDate/)
  })

  it('미인증 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = makeRequest('/api/reports/trial-balance')
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(401)
  })

  it('분개 금액에 exchangeRate를 곱한 원화 환산 합계로 시산표 잔액을 계산한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', code: '1001', name: '현금', type: 'ASSET' },
      { id: 'revenue-1', code: '4001', name: '매출', type: 'REVENUE' },
    ] as never)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ accountId: 'asset-1', total: '130000' }])
      .mockResolvedValueOnce([{ accountId: 'revenue-1', total: '130000' }])

    const req = makeRequest('/api/reports/trial-balance')
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.totalDebits).toBe(130000)
    expect(body.totalCredits).toBe(130000)
    expect(body.accounts[0].balance).toBe(130000)
    expect(body.accounts[1].balance).toBe(130000)
  })
})

// ─── ledger endDate 보정 테스트 ─────────────────────────────────────────────

describe('ledger GET', () => {
  const mockAccount = {
    id: 'acc-1',
    code: '1001',
    name: '현금',
    type: 'ASSET',
    currency: 'KRW',
    userId: 'user-1',
    description: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    vi.mocked(prisma.entry.findMany).mockResolvedValue([])
  })

  it('endDate를 UTC 23:59:59.999로 보정해 당일 거래를 포함한다', async () => {
    const req = makeRequest('/api/reports/ledger', {
      accountId: 'acc-1',
      endDate: '2024-01-15',
    })
    const res = await ledgerGET(req)
    expect(res.status).toBe(200)

    const calls = vi.mocked(prisma.entry.findMany).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const txDate = (calls[0][0] as { where: { transaction: { date: { lte: Date } } } }).where.transaction.date.lte as Date
    expect(txDate.toISOString()).toBe('2024-01-15T23:59:59.999Z')
  })

  it('분개 금액에 exchangeRate를 곱한 원화 환산 금액으로 원장 잔액을 계산한다', async () => {
    vi.mocked(prisma.entry.findMany).mockResolvedValue([
      {
        id: 'entry-1',
        debitAccountId: 'acc-1',
        creditAccountId: 'acc-2',
        amount: '100',
        exchangeRate: '1300',
        description: '외화 매출',
        transaction: {
          id: 'tx-1',
          date: new Date('2024-01-15T00:00:00.000Z'),
          description: '외화 거래',
        },
        debitAccount: { name: '현금' },
        creditAccount: { name: '매출' },
      },
    ] as never)

    const req = makeRequest('/api/reports/ledger', { accountId: 'acc-1' })
    const res = await ledgerGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.entries[0].debit).toBe(130000)
    expect(body.entries[0].credit).toBe(0)
    expect(body.entries[0].balance).toBe(130000)
  })

  it('유효하지 않은 endDate에 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/ledger', {
      accountId: 'acc-1',
      endDate: 'invalid',
    })
    const res = await ledgerGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/endDate/)
  })

  it('startDate > endDate이면 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/ledger', {
      accountId: 'acc-1',
      startDate: '2024-01-20',
      endDate: '2024-01-10',
    })
    const res = await ledgerGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/startDate/)
  })

  it('accountId 없으면 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/ledger')
    const res = await ledgerGET(req)
    expect(res.status).toBe(400)
  })

  it('미인증 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = makeRequest('/api/reports/ledger', { accountId: 'acc-1' })
    const res = await ledgerGET(req)
    expect(res.status).toBe(401)
  })
})

// ─── balance-sheet 환율 반영 테스트 ───────────────────────────────────────

describe('balance-sheet GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', code: '1001', name: '현금', type: 'ASSET' },
      { id: 'liability-1', code: '2001', name: '차입금', type: 'LIABILITY' },
    ] as never)
  })

  it('분개 금액에 exchangeRate를 곱한 원화 환산 합계로 재무상태표 잔액을 계산한다', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ accountId: 'asset-1', total: '130000' }])
      .mockResolvedValueOnce([{ accountId: 'liability-1', total: '130000' }])

    const res = await balanceSheetGET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.assets[0].balance).toBe(130000)
    expect(body.liabilities[0].balance).toBe(130000)
    expect(body.totalAssets).toBe(130000)
    expect(body.totalLiabilities).toBe(130000)
    expect(vi.mocked(prisma.$queryRaw).mock.calls.length).toBe(2)
  })
})

// ─── income-statement 환율 반영 테스트 ─────────────────────────────────────

describe('income-statement GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'rev-1', code: '4001', name: '매출', type: 'REVENUE' },
      { id: 'exp-1', code: '5001', name: '식비', type: 'EXPENSE' },
    ] as never)
  })

  it('분개 금액에 exchangeRate를 곱한 원화 환산 합계로 손익계산서를 계산한다', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accountId: 'rev-1', total: '260000' }])
      .mockResolvedValueOnce([{ accountId: 'exp-1', total: '130000' }])
      .mockResolvedValueOnce([])

    const req = makeRequest('/api/reports/income-statement', { year: '2024', month: '1' })
    const res = await incomeStatementGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.revenues[0].balance).toBe(260000)
    expect(body.expenses[0].balance).toBe(130000)
    expect(body.totalRevenue).toBe(260000)
    expect(body.totalExpense).toBe(130000)
    expect(body.netIncome).toBe(130000)
  })
})

// ─── monthly-summary 테스트 ────────────────────────────────────────────────

describe('monthly-summary GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
  })

  it('year 없으면 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/monthly-summary')
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/year/)
  })

  it('유효하지 않은 year에 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/monthly-summary', { year: 'abc' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/year/)
  })

  it('범위를 벗어난 year에 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/monthly-summary', { year: '99' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(400)
  })

  it('미인증 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(401)
  })

  it('계정이 없으면 12개월 모두 0으로 반환한다', async () => {
    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.months).toHaveLength(12)
    expect(body.totalRevenue).toBe(0)
    expect(body.totalExpense).toBe(0)
    expect(body.totalNetIncome).toBe(0)
    expect(body.totalCashIn).toBe(0)
    expect(body.totalCashOut).toBe(0)
    expect(body.totalNetCashFlow).toBe(0)
  })

  it('계정이 있으면 월간 집계를 단일 raw 쿼리로 조회한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'rev-1', type: 'REVENUE', userId: 'user-1', name: '매출', code: '4001', currency: 'KRW', description: null, createdAt: new Date() },
      { id: 'asset-1', type: 'ASSET', userId: 'user-1', name: '현금', code: '1001', currency: 'KRW', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])

    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)

    expect(res.status).toBe(200)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('수익/비용 데이터가 있으면 월별 손익을 집계한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'rev-1', type: 'REVENUE', userId: 'user-1', name: '매출', code: '4001', currency: 'KRW', description: null, createdAt: new Date() },
      { id: 'exp-1', type: 'EXPENSE', userId: 'user-1', name: '식비', code: '5001', currency: 'KRW', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{
      month: 1,
      revenueCredits: '500000',
      revenueDebits: '0',
      expenseDebits: '100000',
      expenseCredits: '0',
      assetDebits: '0',
      assetCredits: '0',
    }])

    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    const jan = body.months[0]
    expect(jan.month).toBe(1)
    expect(jan.revenue).toBe(500000)
    expect(jan.expense).toBe(100000)
    expect(jan.netIncome).toBe(400000)
    expect(body.totalRevenue).toBe(500000)
    expect(body.totalExpense).toBe(100000)
    expect(body.totalNetIncome).toBe(400000)
  })

  it('자산 데이터가 있으면 월별 현금흐름을 집계한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', type: 'ASSET', userId: 'user-1', name: '현금', code: '1001', currency: 'KRW', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{
      month: 3,
      revenueCredits: '0',
      revenueDebits: '0',
      expenseDebits: '0',
      expenseCredits: '0',
      assetDebits: '1000000',
      assetCredits: '300000',
    }])

    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    const mar = body.months[2]
    expect(mar.month).toBe(3)
    expect(mar.cashIn).toBe(1000000)
    expect(mar.cashOut).toBe(300000)
    expect(mar.netCashFlow).toBe(700000)
    expect(body.totalCashIn).toBe(1000000)
    expect(body.totalCashOut).toBe(300000)
    expect(body.totalNetCashFlow).toBe(700000)
  })

  it('월별 수익/비용/현금흐름 집계 SQL이 기준 통화 조건과 외화 환율을 반영한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'rev-1', type: 'REVENUE', userId: 'user-1', name: '외화 매출', code: '4001', currency: 'USD', description: null, createdAt: new Date() },
      { id: 'exp-1', type: 'EXPENSE', userId: 'user-1', name: '외화 비용', code: '5001', currency: 'USD', description: null, createdAt: new Date() },
      { id: 'asset-1', type: 'ASSET', userId: 'user-1', name: '달러 예금', code: '1001', currency: 'USD', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{
      month: 2,
      revenueCredits: '130000',
      revenueDebits: '13000',
      expenseDebits: '26000',
      expenseCredits: '6000',
      assetDebits: '39000',
      assetCredits: '9000',
    }])

    const req = makeRequest('/api/reports/monthly-summary', { year: '2024' })
    const res = await monthlySummaryGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    const feb = body.months[1]
    expect(feb.revenue).toBe(117000)
    expect(feb.expense).toBe(20000)
    expect(feb.netIncome).toBe(97000)
    expect(feb.cashIn).toBe(39000)
    expect(feb.cashOut).toBe(9000)
    expect(feb.netCashFlow).toBe(30000)
    expect(body.totalRevenue).toBe(117000)
    expect(body.totalExpense).toBe(20000)
    expect(body.totalCashIn).toBe(39000)
    expect(body.totalCashOut).toBe(9000)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)

    const sql = (vi.mocked(prisma.$queryRaw).mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toContain('CASE')
    expect(sql).toContain('WHEN e.currency IS NULL OR e.currency =')
    expect(sql).toContain('THEN e.amount')
    expect(sql).toContain('ELSE e.amount * e."exchangeRate"')
  })
})


// ─── balance-sheet 테스트 ─────────────────────────────────────────────────

describe('balance-sheet GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'asset-1', type: 'ASSET', userId: 'user-1', name: '달러 예금', code: '1001', currency: 'USD', description: null, createdAt: new Date() },
      { id: 'liability-1', type: 'LIABILITY', userId: 'user-1', name: '외화 차입금', code: '2001', currency: 'USD', description: null, createdAt: new Date() },
      { id: 'equity-1', type: 'EQUITY', userId: 'user-1', name: '자본금', code: '3001', currency: 'KRW', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
  })

  it('외화 분개를 환율 반영 금액으로 재무상태표에 집계한다', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ accountId: 'asset-1', total: '130000' }])
      .mockResolvedValueOnce([
        { accountId: 'liability-1', total: '65000' },
        { accountId: 'equity-1', total: '65000' },
      ])

    const res = await balanceSheetGET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.assets[0].balance).toBe(130000)
    expect(body.liabilities[0].balance).toBe(65000)
    expect(body.equity[0].balance).toBe(65000)
    expect(body.totalAssets).toBe(130000)
    expect(body.totalLiabilities).toBe(65000)
    expect(body.totalEquity).toBe(65000)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
    const debitSql = (vi.mocked(prisma.$queryRaw).mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(debitSql).toContain('e.amount * e."exchangeRate"')
    expect(prisma.entry.groupBy).not.toHaveBeenCalled()
  })

  it('미인증 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await balanceSheetGET()
    expect(res.status).toBe(401)
  })
})

// ─── income-statement 테스트 ───────────────────────────────────────────────

describe('income-statement GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'rev-1', type: 'REVENUE', userId: 'user-1', name: '외화 매출', code: '4001', currency: 'USD', description: null, createdAt: new Date() },
      { id: 'exp-1', type: 'EXPENSE', userId: 'user-1', name: '외화 비용', code: '5001', currency: 'USD', description: null, createdAt: new Date() },
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
  })

  it('외화 수익과 비용을 환율 반영 금액으로 손익계산서에 집계한다', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accountId: 'rev-1', total: '130000' }])
      .mockResolvedValueOnce([{ accountId: 'exp-1', total: '26000' }])
      .mockResolvedValueOnce([])

    const req = makeRequest('/api/reports/income-statement', { year: '2024', month: '1' })
    const res = await incomeStatementGET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.revenues[0].balance).toBe(130000)
    expect(body.expenses[0].balance).toBe(26000)
    expect(body.totalRevenue).toBe(130000)
    expect(body.totalExpense).toBe(26000)
    expect(body.netIncome).toBe(104000)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4)
    const revenueSql = (vi.mocked(prisma.$queryRaw).mock.calls[1][0] as TemplateStringsArray).join('?')
    expect(revenueSql).toContain('e.amount * e."exchangeRate"')
    expect(prisma.entry.groupBy).not.toHaveBeenCalled()
  })

  it('year 없으면 400을 반환한다', async () => {
    const req = makeRequest('/api/reports/income-statement')
    const res = await incomeStatementGET(req)
    expect(res.status).toBe(400)
  })

  it('미인증 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = makeRequest('/api/reports/income-statement', { year: '2024' })
    const res = await incomeStatementGET(req)
    expect(res.status).toBe(401)
  })
})
