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
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')

  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (startDateParam || endDateParam) {
    dateFilter = {}
    if (startDateParam) {
      const d = new Date(startDateParam)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: '유효한 startDate를 입력해주세요.' }, { status: 400 })
      }
      dateFilter.gte = d
    }
    if (endDateParam) {
      const d = new Date(endDateParam)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: '유효한 endDate를 입력해주세요.' }, { status: 400 })
      }
      dateFilter.lte = d
    }
    if (dateFilter.gte && dateFilter.lte && dateFilter.gte > dateFilter.lte) {
      return NextResponse.json({ error: 'startDate는 endDate보다 늦을 수 없습니다.' }, { status: 400 })
    }
  }

  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })

  const accountIds = accounts.map(a => a.id)
  const transactionFilter = {
    transaction: {
      userId,
      ...(dateFilter ? { date: dateFilter } : {}),
    },
  }

  const [debitSums, creditSums] = await Promise.all([
    prisma.entry.groupBy({
      by: ['debitAccountId'],
      where: { debitAccountId: { in: accountIds }, ...transactionFilter },
      _sum: { amount: true },
    }),
    prisma.entry.groupBy({
      by: ['creditAccountId'],
      where: { creditAccountId: { in: accountIds }, ...transactionFilter },
      _sum: { amount: true },
    }),
  ])

  const debitByAccount = new Map(
    debitSums.map(r => [r.debitAccountId, Number(r._sum.amount ?? 0)]),
  )
  const creditByAccount = new Map(
    creditSums.map(r => [r.creditAccountId, Number(r._sum.amount ?? 0)]),
  )

  let totalDebits = 0
  let totalCredits = 0

  const rows = accounts.map(account => {
    const debitTotal = debitByAccount.get(account.id) ?? 0
    const creditTotal = creditByAccount.get(account.id) ?? 0
    totalDebits += debitTotal
    totalCredits += creditTotal

    let balance = 0
    if (account.type === 'ASSET' || account.type === 'EXPENSE') {
      balance = debitTotal - creditTotal
    } else {
      balance = creditTotal - debitTotal
    }

    return { id: account.id, code: account.code, name: account.name, type: account.type, debitTotal, creditTotal, balance }
  })

  return NextResponse.json({ accounts: rows, totalDebits, totalCredits })
}
