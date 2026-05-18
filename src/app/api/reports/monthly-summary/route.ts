import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type MonthlySummaryRow = {
  month: number
  revenueCredits: string | null
  revenueDebits: string | null
  expenseDebits: string | null
  expenseCredits: string | null
  assetDebits: string | null
  assetCredits: string | null
}

function makeMonthlySummaryMap(rows: MonthlySummaryRow[]): Map<number, MonthlySummaryRow> {
  return new Map(rows.map(row => [row.month, row]))
}

function toNumber(value: string | null | undefined) {
  return Number(value ?? 0)
}

function toTextArraySql(ids: string[]) {
  return ids.length === 0
    ? Prisma.sql`ARRAY[]::text[]`
    : Prisma.sql`ARRAY[${Prisma.join(ids)}]::text[]`
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
  const revenueIdArray = toTextArraySql(revenueIds)
  const expenseIdArray = toTextArraySql(expenseIds)
  const assetIdArray = toTextArraySql(assetIds)

  const summaryRows = accounts.length === 0
    ? []
    : await prisma.$queryRaw<MonthlySummaryRow[]>`
        WITH monthly_entries AS (
          SELECT EXTRACT(MONTH FROM t.date)::int AS month,
                 e.amount * e."exchangeRate" AS base_amount,
                 e."debitAccountId",
                 e."creditAccountId"
          FROM "Entry" e
          JOIN "Transaction" t ON e."transactionId" = t.id
          WHERE t."userId" = ${userId}
            AND t.date >= ${startOfYear}
            AND t.date <= ${endOfYear}
        )
        SELECT month,
               COALESCE(SUM(base_amount) FILTER (WHERE "creditAccountId" = ANY(${revenueIdArray})), 0)::text AS "revenueCredits",
               COALESCE(SUM(base_amount) FILTER (WHERE "debitAccountId" = ANY(${revenueIdArray})), 0)::text AS "revenueDebits",
               COALESCE(SUM(base_amount) FILTER (WHERE "debitAccountId" = ANY(${expenseIdArray})), 0)::text AS "expenseDebits",
               COALESCE(SUM(base_amount) FILTER (WHERE "creditAccountId" = ANY(${expenseIdArray})), 0)::text AS "expenseCredits",
               COALESCE(SUM(base_amount) FILTER (WHERE "debitAccountId" = ANY(${assetIdArray})), 0)::text AS "assetDebits",
               COALESCE(SUM(base_amount) FILTER (WHERE "creditAccountId" = ANY(${assetIdArray})), 0)::text AS "assetCredits"
        FROM monthly_entries
        GROUP BY month
        ORDER BY month
      `

  const summaryMap = makeMonthlySummaryMap(summaryRows)

  let totalRevenue = 0
  let totalExpense = 0
  let totalCashIn = 0
  let totalCashOut = 0

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const row = summaryMap.get(m)
    const revenue = toNumber(row?.revenueCredits) - toNumber(row?.revenueDebits)
    const expense = toNumber(row?.expenseDebits) - toNumber(row?.expenseCredits)
    const netIncome = revenue - expense
    const cashIn = toNumber(row?.assetDebits)
    const cashOut = toNumber(row?.assetCredits)
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
