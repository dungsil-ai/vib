import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')

  if (!accountId) {
    return NextResponse.json({ error: 'accountId를 입력해주세요.' }, { status: 400 })
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, code: true, name: true, type: true },
  })

  if (!account) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  let startDate: Date | undefined
  let endDate: Date | undefined

  if (startDateParam) {
    const d = new Date(startDateParam)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: '유효한 startDate를 입력해주세요.' }, { status: 400 })
    }
    startDate = d
  }
  if (endDateParam) {
    const d = new Date(endDateParam)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: '유효한 endDate를 입력해주세요.' }, { status: 400 })
    }
    endDate = d
  }

  // Compute opening balance (entries before startDate)
  let openingBalance = 0
  if (startDate) {
    const priorEntries = await prisma.entry.findMany({
      where: {
        OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
        transaction: { date: { lt: startDate } },
      },
      select: { debitAccountId: true, amount: true },
    })
    for (const e of priorEntries) {
      const isDebit = e.debitAccountId === accountId
      const amount = Number(e.amount)
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        openingBalance += isDebit ? amount : -amount
      } else {
        openingBalance += isDebit ? -amount : amount
      }
    }
  }

  const txFilter: { date?: { gte?: Date; lte?: Date } } = {}
  if (startDate || endDate) {
    txFilter.date = {}
    if (startDate) txFilter.date.gte = startDate
    if (endDate) txFilter.date.lte = endDate
  }

  const entries = await prisma.entry.findMany({
    where: {
      OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      ...(Object.keys(txFilter).length > 0 ? { transaction: txFilter } : {}),
    },
    include: {
      transaction: { select: { id: true, date: true, description: true } },
      debitAccount: { select: { name: true } },
      creditAccount: { select: { name: true } },
    },
    orderBy: { transaction: { date: 'asc' } },
  })

  let balance = openingBalance
  const entriesWithBalance = entries.map(e => {
    const isDebit = e.debitAccountId === accountId
    const amount = Number(e.amount)
    let debit = 0
    let credit = 0

    if (account.type === 'ASSET' || account.type === 'EXPENSE') {
      if (isDebit) { debit = amount; balance += amount }
      else { credit = amount; balance -= amount }
    } else {
      if (isDebit) { debit = amount; balance -= amount }
      else { credit = amount; balance += amount }
    }

    return {
      id: e.id,
      date: e.transaction.date,
      transactionDescription: e.transaction.description,
      entryDescription: e.description,
      debit,
      credit,
      balance,
      counterpart: isDebit ? e.creditAccount.name : e.debitAccount.name,
    }
  })

  return NextResponse.json(
    serializeData({ account, openingBalance, entries: entriesWithBalance }),
  )
}
