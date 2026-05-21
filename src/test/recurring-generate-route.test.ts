import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/recurring-transactions/generate/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

describe('recurring-transactions/generate POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
  })

  it('nextRunAt 일치 조건 업데이트가 실패하면 중복 거래를 생성하지 않는다', async () => {
    const dueRunAt = new Date('2024-01-31T00:00:00.000Z')
    vi.mocked(prisma.recurringTransaction.findMany).mockResolvedValue([
      {
        id: 'recurring-1',
        userId: 'user-1',
        description: '월세',
        frequency: 'MONTHLY',
        dayOfMonth: 31,
        monthOfYear: null,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: null,
        nextRunAt: dueRunAt,
        lastRunAt: null,
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        entries: [
          {
            id: 'entry-1',
            recurringTransactionId: 'recurring-1',
            debitAccountId: 'expense-1',
            creditAccountId: 'cash-1',
            amount: '500000',
            description: '월세',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.recurringTransaction.findMany>>)

    const tx = {
      recurringTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      transaction: {
        create: vi.fn(),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.generated).toBe(0)
    expect(body.transactions).toEqual([])
    expect(tx.recurringTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'recurring-1',
        userId: 'user-1',
        isActive: true,
        nextRunAt: dueRunAt,
      }),
    }))
    expect(tx.transaction.create).not.toHaveBeenCalled()
  })

  it('대상 반복 거래가 없으면 빈 결과를 반환한다', async () => {
    vi.mocked(prisma.recurringTransaction.findMany).mockResolvedValue([])

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ generated: 0, transactions: [] })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
