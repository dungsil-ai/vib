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
  debitAccountId?: unknown
  creditAccountId?: unknown
  amount?: unknown
  description?: unknown
}

export type RecurringTransactionInput = {
  description?: unknown
  frequency?: unknown
  dayOfMonth?: unknown
  monthOfYear?: unknown
  startDate?: unknown
  endDate?: unknown
  entries?: unknown
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function validateRecurringTransactionInput(
  input: unknown,
  userId: string,
): Promise<ValidatedRecurringTransactionInput | ValidationFailure> {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: '요청 본문은 객체여야 합니다.' }, { status: 400 }) }
  }

  const { description, frequency, dayOfMonth, monthOfYear, startDate, endDate, entries } = input as RecurringTransactionInput

  if (!description || !frequency || !startDate || !entries || !Array.isArray(entries) || entries.length === 0) {
    return { response: NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 }) }
  }

  if (typeof description !== 'string' || typeof frequency !== 'string') {
    return { response: NextResponse.json({ error: '설명과 반복 주기는 문자열이어야 합니다.' }, { status: 400 }) }
  }

  if (!VALID_RECURRING_FREQUENCIES.includes(frequency as (typeof VALID_RECURRING_FREQUENCIES)[number])) {
    return { response: NextResponse.json({ error: '유효한 반복 주기를 입력해주세요.' }, { status: 400 }) }
  }

  const parsedStart = new Date(startDate instanceof Date ? startDate : String(startDate))
  if (Number.isNaN(parsedStart.getTime())) {
    return { response: NextResponse.json({ error: '유효한 시작 날짜를 입력해주세요.' }, { status: 400 }) }
  }

  let parsedEnd: Date | null = null
  if (endDate) {
    parsedEnd = new Date(endDate instanceof Date ? endDate : String(endDate))
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

  const normalizedEntries: Array<{
    debitAccountId: string
    creditAccountId: string
    amount: string | number
    description?: string | null
  }> = []

  for (const entry of entries) {
    if (!isRecord(entry)) {
      return { response: NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 }) }
    }

    const candidate = entry as RecurringEntryInput
    if (!candidate.debitAccountId || !candidate.creditAccountId || candidate.amount == null) {
      return { response: NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 }) }
    }
    const amount = Number(candidate.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { response: NextResponse.json({ error: '유효한 거래 금액을 입력해주세요.' }, { status: 400 }) }
    }
    const debitAccountId = String(candidate.debitAccountId)
    const creditAccountId = String(candidate.creditAccountId)
    if (debitAccountId === creditAccountId) {
      return { response: NextResponse.json({ error: '차변 계정과 대변 계정은 달라야 합니다.' }, { status: 400 }) }
    }

    normalizedEntries.push({
      debitAccountId,
      creditAccountId,
      amount: candidate.amount as string | number,
      description: typeof candidate.description === 'string' ? candidate.description : null,
    })
  }

  const accountIds = [
    ...new Set([
      ...normalizedEntries.map(entry => entry.debitAccountId),
      ...normalizedEntries.map(entry => entry.creditAccountId),
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
    entries: normalizedEntries,
  }
}

export function unwrapRecurringValidation(
  result: ValidatedRecurringTransactionInput | ValidationFailure,
): ValidatedRecurringTransactionInput | ReturnType<typeof NextResponse.json> {
  return isValidationFailure(result) ? result.response : result
}

export function calculateNextRunAtAfterProgress(
  validated: ValidatedRecurringTransactionInput,
  currentNextRunAt: Date,
) {
  let nextRunAt = new Date(validated.nextRunAt)
  const progressBoundary = new Date(currentNextRunAt)

  while (nextRunAt < progressBoundary) {
    nextRunAt = computeNextRunAt(
      validated.frequency as (typeof VALID_RECURRING_FREQUENCIES)[number],
      validated.dayOfMonth,
      validated.monthOfYear,
      nextRunAt,
    )
  }

  return nextRunAt
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

function getLastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function setUtcYearMonthDay(date: Date, year: number, monthIndex: number, day: number) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(1)
  nextDate.setUTCFullYear(year)
  nextDate.setUTCMonth(monthIndex)
  nextDate.setUTCDate(day)
  return nextDate
}

function computeInitialNextRunAt(
  parsedStart: Date,
  frequency: string,
  dayOfMonth: number | null,
  monthOfYear: number | null,
) {
  let nextRunAt = new Date(parsedStart)
  if ((frequency === 'MONTHLY' || frequency === 'YEARLY') && dayOfMonth) {
    const maxDay = getLastDayOfMonthUtc(nextRunAt.getUTCFullYear(), nextRunAt.getUTCMonth())
    nextRunAt.setUTCDate(Math.min(dayOfMonth, maxDay))
    if (nextRunAt < parsedStart) {
      nextRunAt = computeNextRunAt(
        frequency as (typeof VALID_RECURRING_FREQUENCIES)[number],
        dayOfMonth,
        monthOfYear,
        nextRunAt,
      )
    }
  }
  if (frequency === 'YEARLY' && monthOfYear) {
    const targetMonthIndex = monthOfYear - 1
    let targetYear = nextRunAt.getUTCFullYear()
    const maxDayOfTargetMonth = getLastDayOfMonthUtc(targetYear, targetMonthIndex)
    const targetDay = dayOfMonth ? Math.min(dayOfMonth, maxDayOfTargetMonth) : 1
    nextRunAt = setUtcYearMonthDay(parsedStart, targetYear, targetMonthIndex, targetDay)
    if (nextRunAt < parsedStart) {
      targetYear += 1
      const maxDayOfNextYear = getLastDayOfMonthUtc(targetYear, targetMonthIndex)
      const clampedDay = dayOfMonth ? Math.min(dayOfMonth, maxDayOfNextYear) : 1
      nextRunAt = setUtcYearMonthDay(parsedStart, targetYear, targetMonthIndex, clampedDay)
    }
  }
  return nextRunAt
}
