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
    $transaction: vi.fn(async callback => callback({
      recurringTransaction: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      recurringEntry: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    })),
    recurringTransaction: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    recurringEntry: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
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
    vi.mocked(prisma.recurringTransaction.updateMany).mockResolvedValue({ count: 1 } as Awaited<ReturnType<typeof prisma.recurringTransaction.updateMany>>)
    vi.mocked(prisma.recurringEntry.deleteMany).mockResolvedValue({ count: 1 } as Awaited<ReturnType<typeof prisma.recurringEntry.deleteMany>>)
    vi.mocked(prisma.recurringEntry.createMany).mockResolvedValue({ count: 1 } as Awaited<ReturnType<typeof prisma.recurringEntry.createMany>>)
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma))
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValueOnce({
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
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
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
    } as NonNullable<Awaited<ReturnType<typeof prisma.recurringTransaction.findFirst>>>)
  })

  it('객체가 아닌 요청 본문은 400으로 거부한다', async () => {
    const res = await PUT(makePutRequest(null), { params: Promise.resolve({ id: 'rec-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('객체')
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.updateMany).not.toHaveBeenCalled()
  })

  it('잘못된 JSON 본문은 400으로 거부한다', async () => {
    const req = new NextRequest('http://localhost/api/recurring-transactions/rec-1', {
      method: 'PUT',
      body: '{invalid',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PUT(req, { params: Promise.resolve({ id: 'rec-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('JSON')
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.updateMany).not.toHaveBeenCalled()
  })

  it('isActive만 전달하면 활성 상태만 변경한다', async () => {
    const res = await PUT(makePutRequest({ isActive: false }), { params: Promise.resolve({ id: 'rec-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', userId: 'user-1' },
      data: { isActive: false },
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
    expect(prisma.recurringTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1', userId: 'user-1' },
        data: expect.objectContaining({
          description: '수정된 반복 거래',
          frequency: 'MONTHLY',
          dayOfMonth: 10,
        }),
      }),
    )
    expect(prisma.recurringEntry.deleteMany).toHaveBeenCalledWith({
      where: { recurringTransactionId: 'rec-1' },
    })
    expect(prisma.recurringEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          recurringTransactionId: 'rec-1',
          debitAccountId: 'acc-1',
          creditAccountId: 'acc-2',
          amount: '99000',
          description: '수정 메모',
        },
      ],
    })
  })

  it('수정 시 원래 시작일 기준 계산값이 기존 다음 실행일보다 과거이면 진행된 다음 실행일을 보존한다', async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockReset()
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      description: '기존 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      monthOfYear: null,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: null,
      nextRunAt: new Date('2024-05-25T00:00:00.000Z'),
      lastRunAt: new Date('2024-04-25T00:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as NonNullable<Awaited<ReturnType<typeof prisma.recurringTransaction.findFirst>>>)

    const res = await PUT(makePutRequest({
      description: '금액만 수정된 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      startDate: '2024-01-01',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '120000' },
      ],
    }), { params: Promise.resolve({ id: 'rec-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.recurringTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextRunAt: new Date('2024-05-25T00:00:00.000Z'),
        }),
      }),
    )
  })

  it('스케줄 수정 시 기존 진행 상태 이후의 새 반복일로 nextRunAt을 재계산한다', async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockReset()
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      description: '기존 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      monthOfYear: null,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: null,
      nextRunAt: new Date('2024-05-25T00:00:00.000Z'),
      lastRunAt: new Date('2024-04-25T00:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as NonNullable<Awaited<ReturnType<typeof prisma.recurringTransaction.findFirst>>>)

    const res = await PUT(makePutRequest({
      description: '일자가 수정된 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2024-01-01',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '120000' },
      ],
    }), { params: Promise.resolve({ id: 'rec-1' }) })

    expect(res.status).toBe(200)
    expect(prisma.recurringTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dayOfMonth: 10,
          nextRunAt: new Date('2024-06-10T00:00:00.000Z'),
        }),
      }),
    )
  })

  it('활성 토글 중 소유권 조건 업데이트가 실패하면 404를 반환한다', async () => {
    vi.mocked(prisma.recurringTransaction.updateMany).mockResolvedValue({ count: 0 } as Awaited<ReturnType<typeof prisma.recurringTransaction.updateMany>>)

    const res = await PUT(makePutRequest({ isActive: false }), { params: Promise.resolve({ id: 'rec-1' }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toContain('찾을 수 없습니다')
    expect(prisma.recurringTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'rec-1', userId: 'user-1' },
      data: { isActive: false },
    })
  })

  it('전체 수정 중 소유권 조건 업데이트가 실패하면 항목을 교체하지 않고 404를 반환한다', async () => {
    vi.mocked(prisma.recurringTransaction.updateMany).mockResolvedValue({ count: 0 } as Awaited<ReturnType<typeof prisma.recurringTransaction.updateMany>>)

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

    expect(res.status).toBe(404)
    expect(body.error).toContain('찾을 수 없습니다')
    expect(prisma.recurringEntry.deleteMany).not.toHaveBeenCalled()
    expect(prisma.recurringEntry.createMany).not.toHaveBeenCalled()
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
    expect(prisma.recurringTransaction.updateMany).not.toHaveBeenCalled()
  })
})
