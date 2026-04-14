import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { computeNextRunAt } from '@/lib/recurring'

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      entries: {
        include: {
          debitAccount: { select: { name: true, code: true, type: true } },
          creditAccount: { select: { name: true, code: true, type: true } },
        },
      },
    },
  })

  return NextResponse.json(serializeData(recurringTransactions))
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { description, frequency, dayOfMonth, monthOfYear, startDate, endDate, entries } =
    await request.json()

  if (!description || !frequency || !startDate || !entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
  if (!validFrequencies.includes(frequency)) {
    return NextResponse.json({ error: '유효한 반복 주기를 입력해주세요.' }, { status: 400 })
  }

  const parsedStart = new Date(startDate)
  if (Number.isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: '유효한 시작 날짜를 입력해주세요.' }, { status: 400 })
  }

  if (endDate) {
    const parsedEnd = new Date(endDate)
    if (Number.isNaN(parsedEnd.getTime())) {
      return NextResponse.json({ error: '유효한 종료 날짜를 입력해주세요.' }, { status: 400 })
    }
    if (parsedEnd <= parsedStart) {
      return NextResponse.json({ error: '종료 날짜는 시작 날짜 이후여야 합니다.' }, { status: 400 })
    }
  }

  if (frequency === 'MONTHLY' || frequency === 'YEARLY') {
    const rangeLabel = frequency === 'MONTHLY' ? '월' : '연'
    if (!dayOfMonth || !Number.isFinite(Number(dayOfMonth)) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31) {
      return NextResponse.json({ error: `${rangeLabel} 반복의 경우 1~31 사이의 날짜를 입력해주세요.` }, { status: 400 })
    }
  }

  if (frequency === 'YEARLY') {
    if (!monthOfYear || !Number.isFinite(Number(monthOfYear)) || Number(monthOfYear) < 1 || Number(monthOfYear) > 12) {
      return NextResponse.json({ error: '연 반복의 경우 1~12 사이의 월을 입력해주세요.' }, { status: 400 })
    }
  }

  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 })
    }
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: '유효한 거래 금액을 입력해주세요.' }, { status: 400 })
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return NextResponse.json({ error: '차변 계정과 대변 계정은 달라야 합니다.' }, { status: 400 })
    }
  }

  const accountIds = [
    ...new Set([
      ...entries.map((e: { debitAccountId: string }) => e.debitAccountId),
      ...entries.map((e: { creditAccountId: string }) => e.creditAccountId),
    ]),
  ]
  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId: session.user.id },
    select: { id: true },
  })
  if (ownedAccounts.length !== accountIds.length) {
    return NextResponse.json({ error: '잘못된 계정이 포함되어 있습니다.' }, { status: 403 })
  }

  // Compute initial nextRunAt: first occurrence on or after startDate with the given day settings
  let nextRunAt = new Date(parsedStart)
  if ((frequency === 'MONTHLY' || frequency === 'YEARLY') && dayOfMonth) {
    const maxDay = new Date(nextRunAt.getFullYear(), nextRunAt.getMonth() + 1, 0).getDate()
    nextRunAt.setDate(Math.min(Number(dayOfMonth), maxDay))
    if (nextRunAt < parsedStart) {
      nextRunAt = computeNextRunAt(frequency, Number(dayOfMonth), monthOfYear ? Number(monthOfYear) : null, nextRunAt)
    }
  }
  if (frequency === 'YEARLY' && monthOfYear) {
    const targetMonthIndex = Number(monthOfYear) - 1
    let targetYear = nextRunAt.getFullYear()
    const maxDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
    const targetDay = dayOfMonth ? Math.min(Number(dayOfMonth), maxDayOfTargetMonth) : 1
    nextRunAt = new Date(targetYear, targetMonthIndex, targetDay)
    if (nextRunAt < parsedStart) {
      targetYear += 1
      const maxDayOfNextYear = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
      const clampedDay = dayOfMonth ? Math.min(Number(dayOfMonth), maxDayOfNextYear) : 1
      nextRunAt = new Date(targetYear, targetMonthIndex, clampedDay)
    }
  }

  try {
    const recurring = await prisma.recurringTransaction.create({
      data: {
        userId: session.user.id,
        description,
        frequency,
        dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
        monthOfYear: monthOfYear ? Number(monthOfYear) : null,
        startDate: parsedStart,
        endDate: endDate ? new Date(endDate) : null,
        nextRunAt,
        entries: {
          create: entries.map((entry: {
            debitAccountId: string
            creditAccountId: string
            amount: string
            description?: string
          }) => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
            description: entry.description,
          })),
        },
      },
      include: {
        entries: {
          include: {
            debitAccount: { select: { name: true, code: true } },
            creditAccount: { select: { name: true, code: true } },
          },
        },
      },
    })
    return NextResponse.json(serializeData(recurring), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '반복 거래 생성에 실패했습니다.' }, { status: 400 })
  }
}
