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
    account: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/accounts/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('accounts POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed',
      name: 'Test',
      currency: 'USD',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
  })

  it('초기잔액이 있으면 사용자 기본 통화로 계정과 개시잔액 분개를 생성한다', async () => {
    const tx = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        create: vi.fn()
          .mockResolvedValueOnce({
            id: 'opening-equity-1',
            userId: 'user-1',
            name: '개시잔액',
            code: '3000',
            type: 'EQUITY',
            currency: 'USD',
            description: '초기잔액 자동 분개용 계정',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          })
          .mockResolvedValueOnce({
            id: 'asset-1',
            userId: 'user-1',
            name: '달러 예금',
            code: '1000',
            type: 'ASSET',
            currency: 'USD',
            description: undefined,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          }),
      },
      transaction: {
        create: vi.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    }

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const res = await POST(makePostRequest({
      name: '달러 예금',
      type: 'ASSET',
      openingBalance: '100',
    }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.currency).toBe('USD')
    expect(tx.account.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        name: '개시잔액',
        type: 'EQUITY',
        currency: 'USD',
      }),
    })
    expect(tx.account.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        name: '달러 예금',
        type: 'ASSET',
        currency: 'USD',
      }),
    })
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({
            debitAccountId: 'asset-1',
            creditAccountId: 'opening-equity-1',
            amount: 100,
            currency: 'USD',
            exchangeRate: '1',
          })],
        },
      }),
    })
  })

  it('초기잔액 없는 계정도 사용자 기본 통화를 사용한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([])
    vi.mocked(prisma.account.create).mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      name: '식비',
      code: '5000',
      type: 'EXPENSE',
      currency: 'USD',
      description: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })

    const res = await POST(makePostRequest({ name: '식비', type: 'EXPENSE' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.currency).toBe('USD')
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '식비',
        type: 'EXPENSE',
        currency: 'USD',
      }),
    })
  })

  it('기준 통화와 다른 초기잔액 계정에 환율이 없으면 400을 반환한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)

    const res = await POST(makePostRequest({
      name: '달러 예금',
      type: 'ASSET',
      currency: 'USD',
      openingBalance: '100',
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/환율/)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('기준 통화와 다른 초기잔액 계정에는 입력받은 환율을 저장한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    const tx = {
      account: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        create: vi.fn()
          .mockResolvedValueOnce({
            id: 'opening-equity-1',
            userId: 'user-1',
            name: '개시잔액',
            code: '3000',
            type: 'EQUITY',
            currency: 'USD',
            description: '초기잔액 자동 분개용 계정',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          })
          .mockResolvedValueOnce({
            id: 'asset-1',
            userId: 'user-1',
            name: '달러 예금',
            code: '1000',
            type: 'ASSET',
            currency: 'USD',
            description: undefined,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          }),
      },
      transaction: {
        create: vi.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    }

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const res = await POST(makePostRequest({
      name: '달러 예금',
      type: 'ASSET',
      currency: 'USD',
      openingBalance: '100',
      exchangeRate: '1300',
    }))

    expect(res.status).toBe(201)
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({
            amount: 100,
            currency: 'USD',
            exchangeRate: '1300',
          })],
        },
      }),
    })
  })
})
