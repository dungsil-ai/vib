import { NextResponse } from 'next/server'
import { computeNextRunAt } from '@/lib/recurring'
import { prisma } from '@/lib/prisma'

export const RECURRING_TRANSACTION_INCLUDE = {
  entries: {
    include: {
      debitAccount: { select: { name: true, code: true, type: true } },
      creditAccount: { select: { name: true, code: true, type: true } },
    },
  },
}

export const VALID_RECURRING_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const

type RecurringEntryInput = {
  debitAccountId?: string
  creditAccountId?: string
  amount?: string | number | null
  description?: string | null
}

export type RecurringTransactionInput = {
  description?: string
  frequency?: string
  dayOfMonth?: string | number | null
  monthOfYear?: string | number | null
  startDate?: string
  endDate?: string | null
  entries?: RecurringEntryInput[]
}

type ValidatedRecurringTransactionInput = {
  description: string
  frequency: string
  dayOfMonth: number | null
  monthOfYear: number | null
  startDate: Date
  endDate: Date | null
  nextRunAt: Date
  entries: Array<{
    debitAccountId: string
    creditAccountId: string
    amount: string | number
    description?: string | null
  }>
}

type ValidationFailure = {
  response: ReturnType<typeof NextResponse.json>
}

const isValidationFailure = (
  result: ValidatedRecurringTransactionInput | ValidationFailure,
): result is ValidationFailure => 'response' in result

export async function validateRecurringTransactionInput(
  input: RecurringTransactionInput,
  userId: string,
): Promise<ValidatedRecurringTransactionInput | ValidationFailure> {
  const { description, frequency, dayOfMonth, monthOfYear, startDate, endDate, entries } = input

  if (!description || !frequency || !startDate || !entries || !Array.isArray(entries) || entries.length === 0) {
    return { response: NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 }) }
  }

  if (!VALID_RECURRING_FREQUENCIES.includes(frequency as (typeof VALID_RECURRING_FREQUENCIES)[number])) {
    return { response: NextResponse.json({ error: '유효한 반복 주기를 입력해주세요.' }, { status: 400 }) }
  }

  const parsedStart = new Date(startDate)
  if (Number.isNaN(parsedStart.getTime())) {
    return { response: NextResponse.json({ error: '유효한 시작 날짜를 입력해주세요.' }, { status: 400 }) }
  }

  let parsedEnd: Date | null = null
  if (endDate) {
    parsedEnd = new Date(endDate)
    if (Number.isNaN(parsedEnd.getTime())) {
      return { response: NextResponse.json({ error: '유효한 종료 날짜를 입력해주세요.' }, { status: 400 }) }
    }
    if (parsedEnd <= parsedStart) {
      return { response: NextResponse.json({ error: '종료 날짜는 시작 날짜 이후여야 합니다.' }, { status: 400 }) }
    }
  }

  const parsedDayOfMonth = dayOfMonth ? Number(dayOfMonth) : null
  const parsedMonthOfYear = monthOfYear ? Number(monthOfYear) : null

  if (frequency === 'MONTHLY' || frequency === 'YEARLY') {
    const rangeLabel = frequency === 'MONTHLY' ? '월' : '연'
    if (!parsedDayOfMonth || !Number.isFinite(parsedDayOfMonth) || parsedDayOfMonth < 1 || parsedDayOfMonth > 31) {
      return { response: NextResponse.json({ error: `${rangeLabel} 반복의 경우 1~31 사이의 날짜를 입력해주세요.` }, { status: 400 }) }
    }
  }

  if (frequency === 'YEARLY') {
    if (!parsedMonthOfYear || !Number.isFinite(parsedMonthOfYear) || parsedMonthOfYear < 1 || parsedMonthOfYear > 12) {
      return { response: NextResponse.json({ error: '연 반복의 경우 1~12 사이의 월을 입력해주세요.' }, { status: 400 }) }
    }
  }

  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return { response: NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 }) }
    }
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { response: NextResponse.json({ error: '유효한 거래 금액을 입력해주세요.' }, { status: 400 }) }
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return { response: NextResponse.json({ error: '차변 계정과 대변 계정은 달라야 합니다.' }, { status: 400 }) }
    }
  }

  const accountIds = [
    ...new Set([
      ...entries.map(entry => entry.debitAccountId as string),
      ...entries.map(entry => entry.creditAccountId as string),
    ]),
  ]
  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  })
  if (ownedAccounts.length !== accountIds.length) {
    return { response: NextResponse.json({ error: '잘못된 계정이 포함되어 있습니다.' }, { status: 403 }) }
  }

  return {
    description,
    frequency,
    dayOfMonth: parsedDayOfMonth,
    monthOfYear: parsedMonthOfYear,
    startDate: parsedStart,
    endDate: parsedEnd,
    nextRunAt: computeInitialNextRunAt(parsedStart, frequency, parsedDayOfMonth, parsedMonthOfYear),
    entries: entries.map(entry => ({
      debitAccountId: entry.debitAccountId as string,
      creditAccountId: entry.creditAccountId as string,
      amount: entry.amount as string | number,
      description: entry.description,
    })),
  }
}

export function unwrapRecurringValidation(
  result: ValidatedRecurringTransactionInput | ValidationFailure,
): ValidatedRecurringTransactionInput | ReturnType<typeof NextResponse.json> {
  return isValidationFailure(result) ? result.response : result
}

export function buildRecurringTransactionData(validated: ValidatedRecurringTransactionInput) {
  return {
    description: validated.description,
    frequency: validated.frequency as (typeof VALID_RECURRING_FREQUENCIES)[number],
    dayOfMonth: validated.dayOfMonth,
    monthOfYear: validated.monthOfYear,
    startDate: validated.startDate,
    endDate: validated.endDate,
    nextRunAt: validated.nextRunAt,
    entries: {
      create: validated.entries.map(entry => ({
        debitAccountId: entry.debitAccountId,
        creditAccountId: entry.creditAccountId,
        amount: entry.amount,
        description: entry.description || undefined,
      })),
    },
  }
}

function computeInitialNextRunAt(
  parsedStart: Date,
  frequency: string,
  dayOfMonth: number | null,
  monthOfYear: number | null,
) {
  let nextRunAt = new Date(parsedStart)
  if ((frequency === 'MONTHLY' || frequency === 'YEARLY') && dayOfMonth) {
    const maxDay = new Date(nextRunAt.getFullYear(), nextRunAt.getMonth() + 1, 0).getDate()
    nextRunAt.setDate(Math.min(dayOfMonth, maxDay))
    if (nextRunAt < parsedStart) {
      nextRunAt = computeNextRunAt(frequency, dayOfMonth, monthOfYear, nextRunAt)
    }
  }
  if (frequency === 'YEARLY' && monthOfYear) {
    const targetMonthIndex = monthOfYear - 1
    let targetYear = nextRunAt.getFullYear()
    const maxDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
    const targetDay = dayOfMonth ? Math.min(dayOfMonth, maxDayOfTargetMonth) : 1
    nextRunAt = new Date(targetYear, targetMonthIndex, targetDay)
    if (nextRunAt < parsedStart) {
      targetYear += 1
      const maxDayOfNextYear = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
      const clampedDay = dayOfMonth ? Math.min(dayOfMonth, maxDayOfNextYear) : 1
      nextRunAt = new Date(targetYear, targetMonthIndex, clampedDay)
    }
  }
  return nextRunAt
}
