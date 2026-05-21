import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type AccountSide = 'debit' | 'credit'

type DateFilter = {
  gte?: Date
  lte?: Date
  lt?: Date
}

type EntrySumRow = {
  accountId: string
  total: string | null
}

function accountColumn(side: AccountSide) {
  return side === 'debit'
    ? Prisma.raw('e."debitAccountId"')
    : Prisma.raw('e."creditAccountId"')
}

export async function getBaseCurrencyEntrySumMap({
  accountIds,
  userId,
  side,
  dateFilter,
}: {
  accountIds: string[]
  userId: string
  side: AccountSide
  dateFilter?: DateFilter
}) {
  if (accountIds.length === 0) {
    return new Map<string, number>()
  }

  const accountIdColumn = accountColumn(side)
  const rows = await prisma.$queryRaw<EntrySumRow[]>`
    SELECT ${accountIdColumn} AS "accountId", SUM(e.amount * e."exchangeRate")::text AS total
    FROM "Entry" e
    JOIN "Transaction" t ON t.id = e."transactionId"
    WHERE ${accountIdColumn} = ANY(${accountIds}::text[])
      AND t."userId" = ${userId}
      ${dateFilter?.gte ? Prisma.sql`AND t."date" >= ${dateFilter.gte}` : Prisma.empty}
      ${dateFilter?.lte ? Prisma.sql`AND t."date" <= ${dateFilter.lte}` : Prisma.empty}
      ${dateFilter?.lt ? Prisma.sql`AND t."date" < ${dateFilter.lt}` : Prisma.empty}
    GROUP BY ${accountIdColumn}
  `

  return new Map(rows.map(row => [row.accountId, Number(row.total ?? 0)]))
}
