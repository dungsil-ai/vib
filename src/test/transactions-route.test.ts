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
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/transactions/route'
import { NextRequest } from 'next/server'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }
const mockTransactions = [
  {
    id: 'tx-1',
    userId: 'user-1',
    date: new Date('2024-01-15'),
    description: '점심 식사',
    createdAt: new Date('2024-01-15T12:00:00Z'),
    entries: [],
  },
]

function makeRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

describe('GET /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
  })

  it('인증되지 않은 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = makeRequest('/api/transactions')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('기본 페이지네이션으로 거래 목록을 반환한다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([1, mockTransactions])
    const req = makeRequest('/api/transactions')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('total', 1)
    expect(body).toHaveProperty('page', 1)
    expect(body).toHaveProperty('pageSize', 20)
  })

  it('keyword 필터가 where 절에 반영된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { keyword: '식사' })
    await GET(req)
    const countCalls = vi.mocked(prisma.transaction.count).mock.calls
    expect(countCalls.length).toBeGreaterThan(0)
    const where = countCalls[0][0]?.where as Record<string, unknown>
    expect(where.description).toMatchObject({ contains: '식사' })
  })

  it('keyword가 100자를 초과하면 400을 반환한다', async () => {
    const longKeyword = 'a'.repeat(101)
    const req = makeRequest('/api/transactions', { keyword: longKeyword })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/키워드/)
  })

  it('startDate/endDate 기간 필터가 where 절에 반영된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    })
    await GET(req)
    const countCalls = vi.mocked(prisma.transaction.count).mock.calls
    expect(countCalls.length).toBeGreaterThan(0)
    const where = countCalls[0][0]?.where as Record<string, unknown>
    expect(where.date).toMatchObject({
      gte: expect.any(Date),
      lte: expect.any(Date),
    })
  })

  it('endDate의 시간은 23:59:59.999로 설정된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { endDate: '2024-01-15' })
    await GET(req)
    const countCalls = vi.mocked(prisma.transaction.count).mock.calls
    const where = countCalls[0][0]?.where as Record<string, { lte?: Date }>
    const lte = where.date?.lte
    expect(lte).toBeDefined()
    expect(lte!.getHours()).toBe(23)
    expect(lte!.getMinutes()).toBe(59)
    expect(lte!.getSeconds()).toBe(59)
    expect(lte!.getMilliseconds()).toBe(999)
  })

  it('유효하지 않은 startDate에 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { startDate: 'not-a-date' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/startDate/)
  })

  it('유효하지 않은 endDate에 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { endDate: '2024-13-01' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/endDate/)
  })

  it('accountId 필터가 entries.some 조건에 반영된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { accountId: 'acc-1' })
    await GET(req)
    const countCalls = vi.mocked(prisma.transaction.count).mock.calls
    expect(countCalls.length).toBeGreaterThan(0)
    const where = countCalls[0][0]?.where as Record<string, unknown>
    expect(where.AND).toBeDefined()
    expect((where.AND as unknown[]).length).toBeGreaterThan(0)
  })

  it('minAmount/maxAmount 금액 범위 필터가 where 절에 반영된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { minAmount: '1000', maxAmount: '50000' })
    await GET(req)
    const countCalls = vi.mocked(prisma.transaction.count).mock.calls
    expect(countCalls.length).toBeGreaterThan(0)
    const where = countCalls[0][0]?.where as Record<string, unknown>
    expect(where.AND).toBeDefined()
    expect((where.AND as unknown[]).length).toBeGreaterThan(0)
  })

  it('minAmount가 음수이면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { minAmount: '-100' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/minAmount/)
  })

  it('maxAmount가 음수이면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { maxAmount: '-1' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/maxAmount/)
  })

  it('minAmount가 maxAmount보다 크면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { minAmount: '5000', maxAmount: '1000' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/minAmount/)
  })

  it('sortBy=createdAt 파라미터가 정렬에 반영된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { sortBy: 'createdAt', sortOrder: 'asc' })
    await GET(req)
    const findManyCalls = vi.mocked(prisma.transaction.findMany).mock.calls
    expect(findManyCalls.length).toBeGreaterThan(0)
    const orderBy = findManyCalls[0][0]?.orderBy
    expect(orderBy).toEqual({ createdAt: 'asc' })
  })

  it('기본 정렬은 date 내림차순이다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions')
    await GET(req)
    const findManyCalls = vi.mocked(prisma.transaction.findMany).mock.calls
    expect(findManyCalls.length).toBeGreaterThan(0)
    const orderBy = findManyCalls[0][0]?.orderBy
    expect(orderBy).toEqual({ date: 'desc' })
  })

  it('page 파라미터가 1 미만이면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { page: '0' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/page/)
  })

  it('pageSize가 100을 초과하면 100으로 제한된다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', { pageSize: '200' })
    await GET(req)
    const findManyCalls = vi.mocked(prisma.transaction.findMany).mock.calls
    expect(findManyCalls.length).toBeGreaterThan(0)
    expect(findManyCalls[0][0]?.take).toBe(100)
  })

  it('year/month 레거시 파라미터로 배열을 직접 반환한다', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue(mockTransactions)
    const req = makeRequest('/api/transactions', { year: '2024', month: '1' })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('year만 있고 month가 없으면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { year: '2024' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/year.*month|month.*year/)
  })

  it('month만 있고 year가 없으면 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { month: '1' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/year.*month|month.*year/)
  })

  it('유효하지 않은 month(13)에 400을 반환한다', async () => {
    const req = makeRequest('/api/transactions', { year: '2024', month: '13' })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/year.*month|month.*year|유효/)
  })

  it('여러 필터를 동시에 적용할 수 있다', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []])
    const req = makeRequest('/api/transactions', {
      keyword: '점심',
      accountId: 'acc-1',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      minAmount: '1000',
      maxAmount: '50000',
      sortBy: 'date',
      sortOrder: 'asc',
      page: '2',
      pageSize: '10',
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('page', 2)
    expect(body).toHaveProperty('pageSize', 10)
  })
})

describe('POST /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
  })

  it('인증되지 않은 요청에 401을 반환한다', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('필수 필드 누락 시 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ date: '2024-01-15' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('유효하지 않은 날짜에 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: 'invalid-date',
        description: '테스트',
        entries: [{ debitAccountId: 'a', creditAccountId: 'b', amount: '1000' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/날짜/)
  })

  it('금액이 0 이하이면 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'a', creditAccountId: 'b', amount: '0' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/금액/)
  })

  it('차변/대변 계정이 같으면 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-1', amount: '1000' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/차변.*대변|대변.*차변/)
  })

  it('타인 계정 사용 시 403을 반환한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'other-acc-1', creditAccountId: 'other-acc-2', amount: '1000' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('거래 생성 성공 시 201을 반환한다', async () => {
    const createdTx = {
      id: 'new-tx',
      date: new Date('2024-01-15'),
      description: '점심',
      createdAt: new Date(),
      entries: [],
    }
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue(createdTx as never)
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '점심',
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '15000' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('지원하지 않는 통화 코드에 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000', currency: 'INVALID' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/통화/)
  })

  it('외화 항목에 환율 누락 시 400을 반환한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '100', currency: 'USD' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/환율/)
  })

  it('외화 항목에 지수 표기 환율 입력 시 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2024-01-15',
        description: '테스트',
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '100', currency: 'USD', exchangeRate: '1e3' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/환율/)
  })
})
