import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { AccountOwnershipError, accountBalance, assertAccountsOwned, isDebitNormalAccount } from '@/lib/accounting'

describe('accountBalance', () => {
  it('차변 정상 계정은 차변에서 대변을 차감한다', () => {
    expect(accountBalance('ASSET', 1000, 250)).toBe(750)
    expect(accountBalance('EXPENSE', 1000, 250)).toBe(750)
  })

  it('대변 정상 계정은 대변에서 차변을 차감한다', () => {
    expect(accountBalance('LIABILITY', 1000, 250)).toBe(-750)
    expect(accountBalance('EQUITY', 1000, 250)).toBe(-750)
    expect(accountBalance('REVENUE', 1000, 250)).toBe(-750)
  })

  it('차변 정상 계정 여부를 판별한다', () => {
    expect(isDebitNormalAccount('ASSET')).toBe(true)
    expect(isDebitNormalAccount('EXPENSE')).toBe(true)
    expect(isDebitNormalAccount('LIABILITY')).toBe(false)
  })
})

describe('assertAccountsOwned', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('중복 계정 ID를 제거하고 소유 계정을 조회한다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }] as never)

    await expect(assertAccountsOwned('user-1', ['acc-1', 'acc-1', 'acc-2'])).resolves.toBeUndefined()

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['acc-1', 'acc-2'] }, userId: 'user-1' },
      select: { id: true },
    })
  })

  it('소유하지 않은 계정이 포함되면 소유권 검증 예외를 던진다', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'acc-1' }] as never)

    await expect(assertAccountsOwned('user-1', ['acc-1', 'acc-2'])).rejects.toThrow(AccountOwnershipError)
    await expect(assertAccountsOwned('user-1', ['acc-1', 'acc-2'])).rejects.toThrow('잘못된 계정이 포함되어 있습니다.')
  })

  it('계정 조회 실패는 소유권 검증 예외로 바꾸지 않고 전파한다', async () => {
    const dbError = new Error('데이터베이스 연결 실패')
    vi.mocked(prisma.account.findMany).mockRejectedValue(dbError as never)

    await expect(assertAccountsOwned('user-1', ['acc-1'])).rejects.toBe(dbError)
  })

  it('검증할 계정이 없으면 데이터베이스를 조회하지 않는다', async () => {
    await expect(assertAccountsOwned('user-1', [])).resolves.toBeUndefined()

    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })
})
