import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type MonthRow = { month: number; total: string }

function makeMonthMap(rows: MonthRow[]): Map<number, number> {
  return new Map(rows.map(r => [r.month, Number(r.total ?? 0)]))
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')

  if (!yearParam) {
    return NextResponse.json({ error: 'year를 입력해주세요.' }, { status: 400 })
  }

  if (!/^\d+$/.test(yearParam)) {
    return NextResponse.json({ error: '유효한 year를 입력해주세요.' }, { status: 400 })
  }

  const year = Number(yearParam)
  if (!Number.isFinite(year) || year < 1000 || year > 9999) {
    return NextResponse.json({ error: '유효한 year를 입력해주세요.' }, { status: 400 })
  }

  const startOfYear = new Date(0)
  startOfYear.setUTCFullYear(year, 0, 1)
  startOfYear.setUTCHours(0, 0, 0, 0)

  const endOfYear = new Date(0)
  endOfYear.setUTCFullYear(year, 11, 31)
  endOfYear.setUTCHours(23, 59, 59, 999)

  const accounts = await prisma.account.findMany({
    where: { userId, type: { in: ['REVENUE', 'EXPENSE', 'ASSET'] } },
    select: { id: true, type: true },
  })

  const revenueIds = accounts.filter(a => a.type === 'REVENUE').map(a => a.id)
  const expenseIds = accounts.filter(a => a.type === 'EXPENSE').map(a => a.id)
  const assetIds = accounts.filter(a => a.type === 'ASSET').map(a => a.id)

  const [revCredits, revDebits, expDebits, expCredits, assetDebits, assetCredits] =
    await Promise.all([
      revenueIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."creditAccountId" = ANY(${revenueIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
      revenueIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."debitAccountId" = ANY(${revenueIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
      expenseIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."debitAccountId" = ANY(${expenseIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
      expenseIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."creditAccountId" = ANY(${expenseIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
      assetIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."debitAccountId" = ANY(${assetIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
      assetIds.length === 0
        ? Promise.resolve([] as MonthRow[])
        : prisma.$queryRaw<MonthRow[]>`
            SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                   SUM(e.amount * e."exchangeRate")::text AS total
            FROM "Entry" e
            JOIN "Transaction" t ON e."transactionId" = t.id
            WHERE t."userId" = ${userId}
              AND t.date >= ${startOfYear}
              AND t.date <= ${endOfYear}
              AND e."creditAccountId" = ANY(${assetIds}::text[])
            GROUP BY EXTRACT(MONTH FROM t.date)
          `,
    ])

  const revCreditMap = makeMonthMap(revCredits)
  const revDebitMap = makeMonthMap(revDebits)
  const expDebitMap = makeMonthMap(expDebits)
  const expCreditMap = makeMonthMap(expCredits)
  const assetDebitMap = makeMonthMap(assetDebits)
  const assetCreditMap = makeMonthMap(assetCredits)

  let totalRevenue = 0
  let totalExpense = 0
  let totalCashIn = 0
  let totalCashOut = 0

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const revenue = (revCreditMap.get(m) ?? 0) - (revDebitMap.get(m) ?? 0)
    const expense = (expDebitMap.get(m) ?? 0) - (expCreditMap.get(m) ?? 0)
    const netIncome = revenue - expense
    const cashIn = assetDebitMap.get(m) ?? 0
    const cashOut = assetCreditMap.get(m) ?? 0
    const netCashFlow = cashIn - cashOut

    totalRevenue += revenue
    totalExpense += expense
    totalCashIn += cashIn
    totalCashOut += cashOut

    return { month: m, revenue, expense, netIncome, cashIn, cashOut, netCashFlow }
  })

  return NextResponse.json({
    months,
    totalRevenue,
    totalExpense,
    totalNetIncome: totalRevenue - totalExpense,
    totalCashIn,
    totalCashOut,
    totalNetCashFlow: totalCashIn - totalCashOut,
  })
}
