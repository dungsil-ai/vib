import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { computeNextRunAt } from '@/lib/recurring'
import { apiData, apiError, parseStrictInteger, parseStrictNumber, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request: NextRequest, userId: string) => {
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: { userId },
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

  return apiData(serializeData(recurringTransactions))
})

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const { description, frequency, dayOfMonth, monthOfYear, startDate, endDate, entries } =
    await request.json()

  if (!description || !frequency || !startDate || !entries || !Array.isArray(entries) || entries.length === 0) {
    return apiError('필수 필드를 입력해주세요.')
  }

  const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
  if (!validFrequencies.includes(frequency)) {
    return apiError('유효한 반복 주기를 입력해주세요.')
  }

  const parsedStart = new Date(startDate)
  if (Number.isNaN(parsedStart.getTime())) {
    return apiError('유효한 시작 날짜를 입력해주세요.')
  }

  if (endDate) {
    const parsedEnd = new Date(endDate)
    if (Number.isNaN(parsedEnd.getTime())) {
      return apiError('유효한 종료 날짜를 입력해주세요.')
    }
    if (parsedEnd <= parsedStart) {
      return apiError('종료 날짜는 시작 날짜 이후여야 합니다.')
    }
  }

  if (frequency === 'MONTHLY' || frequency === 'YEARLY') {
    const rangeLabel = frequency === 'MONTHLY' ? '월' : '연'
    const parsedDayOfMonth = parseStrictInteger(dayOfMonth, '반복일')
    if (!parsedDayOfMonth.ok || parsedDayOfMonth.value < 1 || parsedDayOfMonth.value > 31) {
      return apiError(`${rangeLabel} 반복의 경우 1~31 사이의 날짜를 입력해주세요.`)
    }
  }

  if (frequency === 'YEARLY') {
    const parsedMonthOfYear = parseStrictInteger(monthOfYear, '반복월')
    if (!parsedMonthOfYear.ok || parsedMonthOfYear.value < 1 || parsedMonthOfYear.value > 12) {
      return apiError('연 반복의 경우 1~12 사이의 월을 입력해주세요.')
    }
  }

  const normalizedAmounts: number[] = []
  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return apiError('각 항목의 차변·대변 계정과 금액을 입력해주세요.')
    }
    const parsedAmount = parseStrictNumber(entry.amount, '거래 금액')
    if (!parsedAmount.ok || parsedAmount.value <= 0) {
      return apiError('유효한 거래 금액을 입력해주세요.')
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return apiError('차변 계정과 대변 계정은 달라야 합니다.')
    }
    normalizedAmounts.push(parsedAmount.value)
  }

  const accountIds = [
    ...new Set([
      ...entries.map((e: { debitAccountId: string }) => e.debitAccountId),
      ...entries.map((e: { creditAccountId: string }) => e.creditAccountId),
    ]),
  ]
  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  })
  if (ownedAccounts.length !== accountIds.length) {
    return apiError('잘못된 계정이 포함되어 있습니다.', 403)
  }

  // 지정한 날짜 설정에 따라 시작일 이후 첫 실행일을 계산합니다.
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
        userId,
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
          }, index: number) => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: String(normalizedAmounts[index]),
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
})
