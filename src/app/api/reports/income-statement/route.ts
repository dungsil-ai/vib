import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  if (!yearParam) {
    return NextResponse.json({ error: 'year를 입력해주세요.' }, { status: 400 })
  }

  const year = parseInt(yearParam, 10)
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: '유효한 year를 입력해주세요.' }, { status: 400 })
  }

  let dateFilter: { gte: Date; lte: Date }
  if (monthParam) {
    const month = parseInt(monthParam, 10)
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '유효한 month를 입력해주세요.' }, { status: 400 })
    }
    dateFilter = {
      gte: new Date(year, month - 1, 1),
      lte: new Date(year, month, 0, 23, 59, 59, 999),
    }
  } else {
    dateFilter = {
      gte: new Date(year, 0, 1),
      lte: new Date(year, 11, 31, 23, 59, 59, 999),
    }
  }

  const accounts = await prisma.account.findMany({
    where: { userId, type: { in: ['REVENUE', 'EXPENSE'] } },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })

  const revenueIds = accounts.filter(a => a.type === 'REVENUE').map(a => a.id)
  const expenseIds = accounts.filter(a => a.type === 'EXPENSE').map(a => a.id)

  const txFilter = { transaction: { date: dateFilter } }

  const [revDebitSums, revCreditSums, expDebitSums, expCreditSums] = await Promise.all([
    revenueIds.length === 0
      ? Promise.resolve([])
      : prisma.entry.groupBy({
          by: ['debitAccountId'],
          where: { debitAccountId: { in: revenueIds }, ...txFilter },
          _sum: { amount: true },
        }),
    revenueIds.length === 0
      ? Promise.resolve([])
      : prisma.entry.groupBy({
          by: ['creditAccountId'],
          where: { creditAccountId: { in: revenueIds }, ...txFilter },
          _sum: { amount: true },
        }),
    expenseIds.length === 0
      ? Promise.resolve([])
      : prisma.entry.groupBy({
          by: ['debitAccountId'],
          where: { debitAccountId: { in: expenseIds }, ...txFilter },
          _sum: { amount: true },
        }),
    expenseIds.length === 0
      ? Promise.resolve([])
      : prisma.entry.groupBy({
          by: ['creditAccountId'],
          where: { creditAccountId: { in: expenseIds }, ...txFilter },
          _sum: { amount: true },
        }),
  ])

  function toAmountMap<T extends { _sum: { amount: unknown } }>(
    sums: T[],
    getId: (item: T) => string,
  ): Map<string, number> {
    return new Map((sums as T[]).map(r => [getId(r), Number(r._sum.amount ?? 0)]))
  }

  const revDebitMap = toAmountMap(
    revDebitSums as Array<{ debitAccountId: string; _sum: { amount: unknown } }>,
    r => r.debitAccountId,
  )
  const revCreditMap = toAmountMap(
    revCreditSums as Array<{ creditAccountId: string; _sum: { amount: unknown } }>,
    r => r.creditAccountId,
  )
  const expDebitMap = toAmountMap(
    expDebitSums as Array<{ debitAccountId: string; _sum: { amount: unknown } }>,
    r => r.debitAccountId,
  )
  const expCreditMap = toAmountMap(
    expCreditSums as Array<{ creditAccountId: string; _sum: { amount: unknown } }>,
    r => r.creditAccountId,
  )

  let totalRevenue = 0
  let totalExpense = 0

  const revenues = accounts
    .filter(a => a.type === 'REVENUE')
    .map(a => {
      const balance = (revCreditMap.get(a.id) ?? 0) - (revDebitMap.get(a.id) ?? 0)
      totalRevenue += balance
      return { id: a.id, code: a.code, name: a.name, balance }
    })

  const expenses = accounts
    .filter(a => a.type === 'EXPENSE')
    .map(a => {
      const balance = (expDebitMap.get(a.id) ?? 0) - (expCreditMap.get(a.id) ?? 0)
      totalExpense += balance
      return { id: a.id, code: a.code, name: a.name, balance }
    })

  return NextResponse.json({
    revenues,
    expenses,
    totalRevenue,
    totalExpense,
    netIncome: totalRevenue - totalExpense,
  })
}
