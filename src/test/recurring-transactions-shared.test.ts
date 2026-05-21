import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { calculateNextRunAtAfterProgress, validateRecurringTransactionInput, unwrapRecurringValidation } from '@/app/api/recurring-transactions/shared'

describe('recurring-transactions shared validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>)
  })

  it('객체가 아닌 요청 본문은 400으로 거부한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput(null, 'user-1'))

    expect(validation).toBeInstanceOf(Response)
    if (validation instanceof Response) {
      const body = await validation.json()
      expect(validation.status).toBe(400)
      expect(body.error).toContain('객체')
    }
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('객체가 아닌 반복 거래 항목은 400으로 거부한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2024-01-01',
      entries: ['invalid-entry'],
    }, 'user-1'))

    expect(validation).toBeInstanceOf(Response)
    if (validation instanceof Response) {
      const body = await validation.json()
      expect(validation.status).toBe(400)
      expect(body.error).toContain('각 항목')
    }
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('초기 다음 실행일을 UTC 기준으로 계산한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '연 반복 거래',
      frequency: 'YEARLY',
      dayOfMonth: 31,
      monthOfYear: 2,
      startDate: '2024-03-31T15:30:00.000Z',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000' },
      ],
    }, 'user-1'))

    expect(validation).not.toBeInstanceOf(Response)
    if (!(validation instanceof Response)) {
      expect(validation.nextRunAt).toEqual(new Date('2025-02-28T15:30:00.000Z'))
    }
  })

  it('주기에서 사용하지 않는 dayOfMonth/monthOfYear는 null로 정규화한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '일 반복 거래',
      frequency: 'DAILY',
      dayOfMonth: 10,
      monthOfYear: 2,
      startDate: '2024-01-01',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000' },
      ],
    }, 'user-1'))

    expect(validation).not.toBeInstanceOf(Response)
    if (!(validation instanceof Response)) {
      expect(validation.dayOfMonth).toBeNull()
      expect(validation.monthOfYear).toBeNull()
    }
  })

  it('전달된 dayOfMonth가 정수가 아니면 400으로 거부한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '일 반복 거래',
      frequency: 'DAILY',
      dayOfMonth: '10.5',
      startDate: '2024-01-01',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000' },
      ],
    }, 'user-1'))

    expect(validation).toBeInstanceOf(Response)
    if (validation instanceof Response) {
      const body = await validation.json()
      expect(validation.status).toBe(400)
      expect(body.error).toContain('정수')
    }
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('오래 진행된 일 반복의 다음 실행일을 큰 간격으로 계산한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '일 반복 거래',
      frequency: 'DAILY',
      startDate: '2020-01-01T09:00:00.000Z',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000' },
      ],
    }, 'user-1'))

    expect(validation).not.toBeInstanceOf(Response)
    if (!(validation instanceof Response)) {
      expect(calculateNextRunAtAfterProgress(
        validation,
        new Date('2025-05-18T09:00:00.000Z'),
      )).toEqual(new Date('2025-05-18T09:00:00.000Z'))
    }
  })

  it('오래 진행된 월 반복의 다음 실행일을 큰 간격으로 계산한다', async () => {
    const validation = unwrapRecurringValidation(await validateRecurringTransactionInput({
      description: '월 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 31,
      startDate: '2020-01-31T09:00:00.000Z',
      entries: [
        { debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '1000' },
      ],
    }, 'user-1'))

    expect(validation).not.toBeInstanceOf(Response)
    if (!(validation instanceof Response)) {
      expect(calculateNextRunAtAfterProgress(
        validation,
        new Date('2025-05-18T09:00:00.000Z'),
      )).toEqual(new Date('2025-05-31T09:00:00.000Z'))
    }
  })
})
