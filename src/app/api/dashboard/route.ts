import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const userId = session.user.id
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const accounts = await prisma.account.findMany({
      where: { userId },
      select: { id: true, type: true },
    })

    const accountIds = accounts.map(a => a.id)

    const [debitSums, creditSums] = await Promise.all([
      prisma.entry.groupBy({
        by: ['debitAccountId'],
        where: { debitAccountId: { in: accountIds } },
        _sum: { amount: true },
      }),
      prisma.entry.groupBy({
        by: ['creditAccountId'],
        where: { creditAccountId: { in: accountIds } },
        _sum: { amount: true },
      }),
    ])

    const debitByAccount = new Map(
      debitSums.map(r => [r.debitAccountId, Number(r._sum.amount ?? 0)]),
    )
    const creditByAccount = new Map(
      creditSums.map(r => [r.creditAccountId, Number(r._sum.amount ?? 0)]),
    )

    let totalAssets = 0
    let totalLiabilities = 0
    let totalEquity = 0

    for (const account of accounts) {
      const totalDebits = debitByAccount.get(account.id) ?? 0
      const totalCredits = creditByAccount.get(account.id) ?? 0
      let balance = 0
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        balance = totalDebits - totalCredits
      } else {
        balance = totalCredits - totalDebits
      }

      if (account.type === 'ASSET') totalAssets += balance
      if (account.type === 'LIABILITY') totalLiabilities += balance
      if (account.type === 'EQUITY') totalEquity += balance
    }

    const recentTransactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        entries: {
          include: {
            debitAccount: { select: { name: true, code: true, type: true } },
            creditAccount: { select: { name: true, code: true, type: true } },
          },
        },
      },
    })

    const expenseAccountIds = accounts
      .filter(a => a.type === 'EXPENSE')
      .map(a => a.id)

    const monthlyExpenseEntries = expenseAccountIds.length === 0
      ? []
      : await prisma.entry.findMany({
          where: {
            transaction: {
              userId,
              date: { gte: startOfMonth, lte: endOfMonth },
            },
            debitAccountId: { in: expenseAccountIds },
          },
          include: {
            debitAccount: { select: { id: true, name: true, code: true } },
          },
        })

    const expenseByAccount: Record<string, { name: string; code: string; actual: number }> = {}
    for (const entry of monthlyExpenseEntries) {
      const accId = entry.debitAccountId
      if (!expenseByAccount[accId]) {
        expenseByAccount[accId] = {
          name: entry.debitAccount.name,
          code: entry.debitAccount.code,
          actual: 0,
        }
      }
      expenseByAccount[accId].actual += Number(entry.amount)
    }

    const budgets = await prisma.budget.findMany({
      where: { userId, year, month },
      include: { account: { select: { name: true, code: true } } },
    })

    const budgetOverview = budgets.map(b => ({
      accountId: b.accountId,
      name: b.account.name,
      code: b.account.code,
      budget: Number(b.amount),
      actual: expenseByAccount[b.accountId]?.actual || 0,
    }))

    return NextResponse.json(
      serializeData({
        totalAssets,
        totalLiabilities,
        totalEquity,
        netWorth: totalAssets - totalLiabilities,
        recentTransactions,
        budgetOverview,
      }),
    )
  } catch (error) {
    console.error('[dashboard] GET error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

