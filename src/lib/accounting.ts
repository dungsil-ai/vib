import { prisma } from '@/lib/prisma'

const DEBIT_NORMAL_ACCOUNT_TYPES = new Set(['ASSET', 'EXPENSE'])

export function accountBalance(accountType: string, debits: number, credits: number) {
  return DEBIT_NORMAL_ACCOUNT_TYPES.has(accountType) ? debits - credits : credits - debits
}

export function isDebitNormalAccount(accountType: string) {
  return DEBIT_NORMAL_ACCOUNT_TYPES.has(accountType)
}

export async function assertAccountsOwned(userId: string, ids: Iterable<string>) {
  const accountIds = Array.from(new Set(ids))
  if (accountIds.length === 0) return

  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  })

  if (ownedAccounts.length !== accountIds.length) {
    throw new Error('잘못된 계정이 포함되어 있습니다.')
  }
}
