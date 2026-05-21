import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    $transaction: vi.fn(),
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/accounts/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/accounts', () => {
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
    } as never)
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
      openingBalance: 100,
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
    vi.mocked(prisma.account.create).mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      name: '식비',
      code: '5000',
      type: 'EXPENSE',
      currency: 'USD',
      description: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as never)

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

  it('초기잔액이 있는 계정 생성 시 선택한 통화를 저장한다', async () => {
    const existingOpeningEquityAccount = {
      id: 'opening-equity-1',
      userId: 'user-1',
      name: '개시잔액',
      code: '3000',
      type: 'EQUITY',
      currency: 'KRW',
      description: '초기잔액 자동 분개용 계정',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }
    const createdAccount = {
      id: 'account-1',
      userId: 'user-1',
      name: '달러 현금',
      code: '1000',
      type: 'ASSET',
      currency: 'USD',
      description: null,
      createdAt: new Date('2024-01-02T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    }
    const tx = {
      account: {
        findFirst: vi.fn().mockResolvedValue(existingOpeningEquityAccount),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(createdAccount),
      },
      transaction: {
        create: vi.fn().mockResolvedValue({ id: 'transaction-1' }),
      },
    }

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const res = await POST(makePostRequest({
      name: '달러 현금',
      type: 'ASSET',
      currency: 'USD',
      openingBalance: 100,
      exchangeRate: '1300.5',
    }))

    expect(res.status).toBe(201)
    expect(tx.account.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: '달러 현금',
        currency: 'USD',
      }),
    }))
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({
            amount: 100,
            currency: 'USD',
            exchangeRate: '1300.5',
          })],
        },
      }),
    }))
  })

  it('외화 초기잔액 생성 시 환율이 없으면 거부한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)

    const res = await POST(makePostRequest({
      name: '달러 현금',
      type: 'ASSET',
      currency: 'USD',
      openingBalance: 100,
    }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('외화(USD) 초기잔액에는 환율(exchangeRate)이 필요합니다.')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
