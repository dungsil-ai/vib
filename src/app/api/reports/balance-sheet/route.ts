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

  const accounts = await prisma.account.findMany({
    where: { userId, type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })

  const accountIds = accounts.map(a => a.id)

  const [debitSums, creditSums] = await Promise.all([
    prisma.entry.groupBy({
      by: ['debitAccountId'],
      where: { debitAccountId: { in: accountIds }, transaction: { userId } },
      _sum: { amount: true },
    }),
    prisma.entry.groupBy({
      by: ['creditAccountId'],
      where: { creditAccountId: { in: accountIds }, transaction: { userId } },
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

  const assets: { id: string; code: string; name: string; balance: number }[] = []
  const liabilities: { id: string; code: string; name: string; balance: number }[] = []
  const equity: { id: string; code: string; name: string; balance: number }[] = []

  for (const account of accounts) {
    const debit = debitByAccount.get(account.id) ?? 0
    const credit = creditByAccount.get(account.id) ?? 0
    const balance = account.type === 'ASSET' ? debit - credit : credit - debit
    const row = { id: account.id, code: account.code, name: account.name, balance }

    if (account.type === 'ASSET') { assets.push(row); totalAssets += balance }
    else if (account.type === 'LIABILITY') { liabilities.push(row); totalLiabilities += balance }
    else { equity.push(row); totalEquity += balance }
  }

  return NextResponse.json({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity })
}
