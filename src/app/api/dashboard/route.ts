import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: {
      debitEntries: { select: { amount: true } },
      creditEntries: { select: { amount: true } },
    },
  })

  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  for (const account of accounts) {
    const totalDebits = account.debitEntries.reduce((sum, e) => sum + e.amount, 0)
    const totalCredits = account.creditEntries.reduce((sum, e) => sum + e.amount, 0)
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

  const monthlyExpenseEntries = await prisma.entry.findMany({
    where: {
      transaction: {
        userId,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      debitAccount: { type: 'EXPENSE' },
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
    expenseByAccount[accId].actual += entry.amount
  }

  const budgets = await prisma.budget.findMany({
    where: { userId, year, month },
    include: { account: { select: { name: true, code: true } } },
  })

  const budgetOverview = budgets.map(b => ({
    accountId: b.accountId,
    name: b.account.name,
    code: b.account.code,
    budget: b.amount,
    actual: expenseByAccount[b.accountId]?.actual || 0,
  }))

  return NextResponse.json({
    totalAssets,
    totalLiabilities,
    totalEquity,
    netWorth: totalAssets - totalLiabilities,
    recentTransactions,
    budgetOverview,
  })
}
