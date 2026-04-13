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
    entry: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as trialBalanceGET } from '@/app/api/reports/trial-balance/route'
import { GET as ledgerGET } from '@/app/api/reports/ledger/route'
import { NextRequest } from 'next/server'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makeRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

// ─── trial-balance endDate 보정 테스트 ─────────────────────────────────────

describe('trial-balance GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
    vi.mocked(prisma.entry.groupBy).mockResolvedValue([])
  })

  it('endDate를 23:59:59.999로 보정해 당일 거래를 포함한다', async () => {
    const req = makeRequest('/api/reports/trial-balance', { endDate: '2024-01-15' })
    const res = await trialBalanceGET(req)
    expect(res.status).toBe(200)

    // entry.groupBy 호출 시 lte가 당일 끝(23:59:59.999)으로 설정되었는지 검증
    const calls = vi.mocked(prisma.entry.groupBy).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const whereDate = (calls[0][0] as { where: { transaction: { date: { lte: Date } } } }).where.transaction.date.lte as Date
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
})

// ─── ledger endDate 보정 테스트 ─────────────────────────────────────────────

describe('ledger GET', () => {
  const mockAccount = { id: 'acc-1', code: '1001', name: '현금', type: 'ASSET' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.entry.aggregate).mockResolvedValue({ _sum: { amount: null } } as ReturnType<typeof prisma.entry.aggregate> extends Promise<infer T> ? T : never)
    vi.mocked(prisma.entry.findMany).mockResolvedValue([])
  })

  it('endDate를 23:59:59.999로 보정해 당일 거래를 포함한다', async () => {
    const req = makeRequest('/api/reports/ledger', {
      accountId: 'acc-1',
      endDate: '2024-01-15',
    })
    const res = await ledgerGET(req)
    expect(res.status).toBe(200)

    // entry.findMany 호출 시 lte가 당일 끝으로 설정되었는지 검증
    const calls = vi.mocked(prisma.entry.findMany).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const txDate = (calls[0][0] as { where: { transaction: { date: { lte: Date } } } }).where.transaction.date.lte as Date
    expect(txDate.getHours()).toBe(23)
    expect(txDate.getMinutes()).toBe(59)
    expect(txDate.getSeconds()).toBe(59)
    expect(txDate.getMilliseconds()).toBe(999)
    expect(txDate.getDate()).toBe(15)
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
