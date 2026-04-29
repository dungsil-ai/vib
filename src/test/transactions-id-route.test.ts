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
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { PUT } from '@/app/api/transactions/[id]/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makePutRequest(body: unknown) {
  return new NextRequest('http://localhost/api/transactions/tx-1', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('transactions/[id] PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
    })
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }])
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' })
    vi.mocked(prisma.transaction.update).mockResolvedValue({
      id: 'tx-1',
      description: '수정된 거래',
      entries: [],
    })
  })

  it('기존 거래를 수정하면서 분개 항목을 교체한다', async () => {
    const req = makePutRequest({
      date: '2024-01-15',
      description: '수정된 거래',
      entries: [
        {
          debitAccountId: 'acc-1',
          creditAccountId: 'acc-2',
          amount: '15000',
          currency: 'krw',
        },
      ],
    })

    const res = await PUT(req, { params: Promise.resolve({ id: 'tx-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({
          description: '수정된 거래',
          entries: expect.objectContaining({
            deleteMany: {},
            create: [
              expect.objectContaining({
                debitAccountId: 'acc-1',
                creditAccountId: 'acc-2',
                amount: '15000',
                currency: 'KRW',
                exchangeRate: '1',
              }),
            ],
          }),
        }),
      }),
    )
  })

  it('외화 분개에 환율이 없으면 400을 반환한다', async () => {
    const req = makePutRequest({
      date: '2024-01-15',
      description: '달러 거래',
      entries: [
        {
          debitAccountId: 'acc-1',
          creditAccountId: 'acc-2',
          amount: '10',
          currency: 'USD',
        },
      ],
    })

    const res = await PUT(req, { params: Promise.resolve({ id: 'tx-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('환율')
    expect(prisma.transaction.update).not.toHaveBeenCalled()
  })
})
