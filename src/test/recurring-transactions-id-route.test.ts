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
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { PUT } from '@/app/api/recurring-transactions/[id]/route'
import { RECURRING_TRANSACTION_INCLUDE } from '@/app/api/recurring-transactions/shared'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function makePutRequest(body: unknown) {
  return new NextRequest('http://localhost/api/recurring-transactions/rec-1', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('recurring-transactions/[id] PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      description: '기존 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      monthOfYear: null,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: null,
      nextRunAt: new Date('2024-02-25T00:00:00.000Z'),
      lastRunAt: null,
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as NonNullable<Awaited<ReturnType<typeof prisma.recurringTransaction.findFirst>>>)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>)
    vi.mocked(prisma.recurringTransaction.update).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      description: '수정된 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      monthOfYear: null,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: null,
      nextRunAt: new Date('2024-01-10T00:00:00.000Z'),
      lastRunAt: null,
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      entries: [],
    } as Awaited<ReturnType<typeof prisma.recurringTransaction.update>>)
  })

  it('isActive만 전달하면 활성 상태만 변경한다', async () => {
    const res = await PUT(makePutRequest({ isActive: false }), { params: Promise.resolve({ id: 'rec-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { isActive: false },
      include: RECURRING_TRANSACTION_INCLUDE,
    })
  })

  it('설명, 스케줄, 항목, 금액을 수정하면서 기존 항목을 교체한다', async () => {
    const res = await PUT(makePutRequest({
      description: '수정된 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2024-01-01',
      entries: [
        {
          debitAccountId: 'acc-1',
          creditAccountId: 'acc-2',
          amount: '99000',
          description: '수정 메모',
        },
      ],
    }), { params: Promise.resolve({ id: 'rec-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.recurringTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1' },
        data: expect.objectContaining({
          description: '수정된 반복 거래',
          frequency: 'MONTHLY',
          dayOfMonth: 10,
          entries: {
            deleteMany: {},
            create: [
              {
                debitAccountId: 'acc-1',
                creditAccountId: 'acc-2',
                amount: '99000',
                description: '수정 메모',
              },
            ],
          },
        }),
        include: RECURRING_TRANSACTION_INCLUDE,
      }),
    )
  })

  it('소유하지 않은 계정이 포함되면 403을 반환한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'acc-1' }] as Awaited<ReturnType<typeof prisma.account.findMany>>)

    const res = await PUT(makePutRequest({
      description: '수정된 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2024-01-01',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '99000' },
      ],
    }), { params: Promise.resolve({ id: 'rec-1' }) })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain('잘못된 계정')
    expect(prisma.recurringTransaction.update).not.toHaveBeenCalled()
  })
})
