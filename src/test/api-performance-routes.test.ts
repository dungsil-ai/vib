import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringTransaction: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    transactionTemplate: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as recurringGET } from '@/app/api/recurring-transactions/route'
import { POST as generateRecurringPOST } from '@/app/api/recurring-transactions/generate/route'
import { GET as templatesGET } from '@/app/api/templates/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makeRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return new NextRequest(url.toString())
}

describe('목록 API 페이지네이션', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.$transaction).mockImplementation(async (queries: unknown) => {
      if (Array.isArray(queries)) {
        return Promise.all(queries)
      }
      throw new Error('지원하지 않는 트랜잭션 호출입니다.')
    })
  })

  it('반복 거래 GET은 page/pageSize가 있으면 페이지네이션 응답을 반환한다', async () => {
    vi.mocked(prisma.recurringTransaction.count).mockResolvedValue(25)
    vi.mocked(prisma.recurringTransaction.findMany).mockResolvedValue([{ id: 'rec-1' }] as never)

    const res = await recurringGET(makeRequest('/api/recurring-transactions', { page: '2', pageSize: '10' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.recurringTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
    }))
    expect(body).toMatchObject({ total: 25, page: 2, pageSize: 10, data: [{ id: 'rec-1' }] })
  })

  it('템플릿 GET은 page/pageSize가 있으면 페이지네이션 응답을 반환한다', async () => {
    vi.mocked(prisma.transactionTemplate.count).mockResolvedValue(3)
    vi.mocked(prisma.transactionTemplate.findMany).mockResolvedValue([{ id: 'tmpl-1' }] as never)

    const res = await templatesGET(makeRequest('/api/templates', { page: '1', pageSize: '2' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.transactionTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 2,
    }))
    expect(body).toMatchObject({ total: 3, page: 1, pageSize: 2, data: [{ id: 'tmpl-1' }] })
  })

  it('pageSize가 100을 초과하면 400을 반환한다', async () => {
    const res = await templatesGET(makeRequest('/api/templates', { pageSize: '101' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/pageSize/)
  })
})

describe('반복 거래 생성 API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
  })

  it('만기 반복 거래를 병렬 트랜잭션으로 생성한다', async () => {
    let activeTransactions = 0
    let maxActiveTransactions = 0

    vi.mocked(prisma.recurringTransaction.findMany).mockResolvedValue([
      {
        id: 'rec-1',
        userId: 'user-1',
        description: '월세',
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        monthOfYear: null,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: null,
        nextRunAt: new Date('2024-02-01T00:00:00.000Z'),
        lastRunAt: null,
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        entries: [],
      },
      {
        id: 'rec-2',
        userId: 'user-1',
        description: '구독료',
        frequency: 'MONTHLY',
        dayOfMonth: 5,
        monthOfYear: null,
        startDate: new Date('2024-01-05T00:00:00.000Z'),
        endDate: null,
        nextRunAt: new Date('2024-02-05T00:00:00.000Z'),
        lastRunAt: null,
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        entries: [],
      },
    ] as never)

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('콜백 트랜잭션만 예상합니다.')
      }
      activeTransactions += 1
      maxActiveTransactions = Math.max(maxActiveTransactions, activeTransactions)
      await new Promise(resolve => setTimeout(resolve, 5))
      try {
        return await callback({
          recurringTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          transaction: { create: vi.fn().mockResolvedValue({ id: `tx-${maxActiveTransactions}` }) },
        })
      } finally {
        activeTransactions -= 1
      }
    })

    const res = await generateRecurringPOST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(maxActiveTransactions).toBeGreaterThan(1)
    expect(body.generated).toBe(2)
  })
})
