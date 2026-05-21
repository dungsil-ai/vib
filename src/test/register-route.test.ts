import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFindUnique, mockUserCreate, mockAccountCreateMany, mockTransaction, mockHash } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockAccountCreateMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockHash: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
    $transaction: mockTransaction,
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: mockHash,
  },
}))

import { POST } from '@/app/api/auth/register/route'

function createRegisterRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(null)
    mockHash.mockResolvedValue('해시된-비밀번호')
    mockUserCreate.mockResolvedValue({ id: 'user-1' })
    mockAccountCreateMany.mockResolvedValue({ count: 16 })
    mockTransaction.mockImplementation(async (callback: (tx: {
      user: { create: typeof mockUserCreate }
      account: { createMany: typeof mockAccountCreateMany }
    }) => Promise<unknown>) => callback({
      user: { create: mockUserCreate },
      account: { createMany: mockAccountCreateMany },
    }))
  })

  it('선택 통화로 사용자와 기본 계정을 함께 생성한다', async () => {
    const res = await POST(createRegisterRequest({
      name: '홍길동',
      email: 'USER@example.com',
      password: 'password123',
      currency: 'USD',
    }))

    expect(res.status).toBe(201)
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        name: '홍길동',
        email: 'user@example.com',
        password: '해시된-비밀번호',
        currency: 'USD',
      },
    })
    expect(mockAccountCreateMany).toHaveBeenCalledTimes(1)
    const createManyArg = mockAccountCreateMany.mock.calls[0][0]
    expect(createManyArg.data).toHaveLength(16)
    expect(createManyArg.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: '1001', userId: 'user-1', currency: 'USD' }),
        expect.objectContaining({ code: '5008', userId: 'user-1', currency: 'USD' }),
      ]),
    )
    expect(createManyArg.data.every((account: { currency: string }) => account.currency === 'USD')).toBe(true)
  })

  it('통화가 없으면 사용자와 기본 계정에 KRW를 적용한다', async () => {
    const res = await POST(createRegisterRequest({
      name: '홍길동',
      email: 'user@example.com',
      password: 'password123',
    }))

    expect(res.status).toBe(201)
    expect(mockUserCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currency: 'KRW' }),
    }))
    const createManyArg = mockAccountCreateMany.mock.calls[0][0]
    expect(createManyArg.data.every((account: { currency: string }) => account.currency === 'KRW')).toBe(true)
  })
})
