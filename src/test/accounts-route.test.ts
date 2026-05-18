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
    $queryRaw: vi.fn(),
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
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
  })

  it('개시잔액이 있는 계정을 생성할 때 선택한 통화를 저장한다', async () => {
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
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const transactionCallback = callback as (transactionClient: typeof tx) => Promise<unknown>
      return transactionCallback(tx)
    })

    const res = await POST(makePostRequest({
      name: '달러 현금',
      type: 'ASSET',
      currency: 'USD',
      openingBalance: 100,
    }))

    expect(res.status).toBe(201)
    expect(tx.account.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: '달러 현금',
        type: 'ASSET',
        currency: 'USD',
      }),
    }))
  })
})
