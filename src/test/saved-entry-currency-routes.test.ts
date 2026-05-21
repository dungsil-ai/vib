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
    account: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    transactionTemplate: { create: vi.fn() },
    recurringTransaction: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/serialize', () => ({
  serializeData: (data: unknown) => data,
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST as createTemplate } from '@/app/api/templates/route'
import { POST as createRecurring } from '@/app/api/recurring-transactions/route'
import { POST as generateRecurring } from '@/app/api/recurring-transactions/generate/route'

const mockSession = { user: { id: 'user-1', email: 'test@example.com', name: 'Test' } }

function postRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('저장된 분개 통화/환율 처리', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }] as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ currency: 'KRW' } as never)
  })

  it('템플릿 생성 시 분개의 통화와 환율을 저장한다', async () => {
    vi.mocked(prisma.transactionTemplate.create).mockResolvedValue({ id: 'tmpl-1', entries: [] } as never)

    const res = await createTemplate(postRequest('/api/templates', {
      description: '외화 템플릿',
      entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'usd', exchangeRate: '1300.50' }],
    }))

    expect(res.status).toBe(201)
    expect(prisma.transactionTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({ currency: 'USD', exchangeRate: '1300.50' })],
        },
      }),
    }))
  })

  it('반복 거래 생성 시 분개의 통화와 환율을 저장한다', async () => {
    vi.mocked(prisma.recurringTransaction.create).mockResolvedValue({ id: 'rec-1', entries: [] } as never)

    const res = await createRecurring(postRequest('/api/recurring-transactions', {
      description: '외화 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      startDate: '2024-01-01',
      entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'USD', exchangeRate: '1300.50' }],
    }))

    expect(res.status).toBe(201)
    expect(prisma.recurringTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({ currency: 'USD', exchangeRate: '1300.50' })],
        },
      }),
    }))
  })

  it.each([
    ['템플릿', createTemplate, '/api/templates', { description: '기준 통화 템플릿' }, () => prisma.transactionTemplate.create],
    ['반복 거래', createRecurring, '/api/recurring-transactions', {
      description: '기준 통화 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      startDate: '2024-01-01',
    }, () => prisma.recurringTransaction.create],
  ])('%s 생성 시 기준 통화 분개의 환율은 항상 1로 저장한다', async (_label, handler, path, baseBody, getCreateMock) => {
    vi.mocked(getCreateMock()).mockResolvedValue({ id: 'saved-entry-1', entries: [] } as never)

    const res = await handler(postRequest(path, {
      ...baseBody,
      entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'KRW', exchangeRate: '1300.50' }],
    }))

    expect(res.status).toBe(201)
    expect(getCreateMock()).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({ currency: 'KRW', exchangeRate: '1' })],
        },
      }),
    }))
  })

  it.each([
    ['템플릿', createTemplate, '/api/templates', { description: '외화 템플릿' }],
    ['반복 거래', createRecurring, '/api/recurring-transactions', {
      description: '외화 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      startDate: '2024-01-01',
    }],
  ])('%s 생성 시 외화 분개에 환율이 없으면 거부한다', async (_label, handler, path, baseBody) => {
    const res = await handler(postRequest(path, {
      ...baseBody,
      entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'USD' }],
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('외화(USD) 분개에는 환율(exchangeRate)이 필요합니다.')
    expect(prisma.transactionTemplate.create).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.create).not.toHaveBeenCalled()
  })

  it.each([
    ['템플릿', createTemplate, '/api/templates', { description: '지원하지 않는 통화 템플릿' }],
    ['반복 거래', createRecurring, '/api/recurring-transactions', {
      description: '지원하지 않는 통화 반복 거래',
      frequency: 'MONTHLY',
      dayOfMonth: 25,
      startDate: '2024-01-01',
    }],
  ])('%s 생성 시 지원하지 않는 통화 코드를 거부한다', async (_label, handler, path, baseBody) => {
    const res = await handler(postRequest(path, {
      ...baseBody,
      entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'ZZZ', exchangeRate: '1300' }],
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('지원하지 않는 통화 코드입니다.')
    expect(prisma.transactionTemplate.create).not.toHaveBeenCalled()
    expect(prisma.recurringTransaction.create).not.toHaveBeenCalled()
  })

  it('반복 거래 생성 실행 시 원본 분개의 통화와 환율을 거래 분개로 복사한다', async () => {
    const dueDate = new Date('2024-01-25T00:00:00.000Z')
    vi.mocked(prisma.recurringTransaction.findMany).mockResolvedValue([
      {
        id: 'rec-1',
        userId: 'user-1',
        description: '외화 반복 거래',
        frequency: 'MONTHLY',
        dayOfMonth: 25,
        monthOfYear: null,
        nextRunAt: dueDate,
        endDate: null,
        entries: [{ debitAccountId: 'acc-1', creditAccountId: 'acc-2', amount: '10', currency: 'USD', exchangeRate: '1300.50', description: '달러' }],
      },
    ] as never)
    const tx = {
      recurringTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      transaction: { create: vi.fn().mockResolvedValue({ id: 'tx-1', entries: [] }) },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(tx as never) as never)

    const res = await generateRecurring()

    expect(res.status).toBe(200)
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [expect.objectContaining({ currency: 'USD', exchangeRate: '1300.50' })],
        },
      }),
    }))
  })
})
