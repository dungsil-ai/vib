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

const DAY_IN_MS = 24 * 60 * 60 * 1000
const WEEK_IN_MS = 7 * DAY_IN_MS

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
}

function addUtcMonths(date: Date, months: number, dayOfMonth: number | null) {
  const nextDate = new Date(date)
  const targetDay = dayOfMonth ?? nextDate.getUTCDate()

  nextDate.setUTCDate(1)
  nextDate.setUTCMonth(nextDate.getUTCMonth() + months)

  const maxDay = getLastDayOfMonthUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth())
  nextDate.setUTCDate(Math.min(targetDay, maxDay))

  return nextDate
}

function addUtcYears(date: Date, years: number, dayOfMonth: number | null, monthOfYear: number | null) {
  const nextDate = new Date(date)
  const targetDay = dayOfMonth ?? nextDate.getUTCDate()

  nextDate.setUTCDate(1)
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + years)
  if (monthOfYear) {
    nextDate.setUTCMonth(monthOfYear - 1)
  }

  const maxDay = getLastDayOfMonthUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth())
  nextDate.setUTCDate(Math.min(targetDay, maxDay))

  return nextDate
}

function countUtcMonthBoundaryDistance(from: Date, to: Date) {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth()
}

function countUtcYearBoundaryDistance(from: Date, to: Date) {
  return to.getUTCFullYear() - from.getUTCFullYear()
}

function advanceWithinCorrectionLimit(
  nextRunAt: Date,
  progressBoundary: Date,
  validated: ValidatedRecurringTransactionInput,
) {
  let correctedNextRunAt = nextRunAt

  for (let index = 0; correctedNextRunAt < progressBoundary && index < 24; index += 1) {
    correctedNextRunAt = computeNextRunAt(
      validated.frequency as (typeof VALID_RECURRING_FREQUENCIES)[number],
      validated.dayOfMonth,
      validated.monthOfYear,
      correctedNextRunAt,
    )
  }

  return correctedNextRunAt
}

export function calculateNextRunAtAfterProgress(
  validated: ValidatedRecurringTransactionInput,
  currentNextRunAt: Date,
) {
  const nextRunAt = new Date(validated.nextRunAt)
  const progressBoundary = new Date(currentNextRunAt)

  if (nextRunAt >= progressBoundary) {
    return nextRunAt
  }

  switch (validated.frequency) {
    case 'DAILY': {
      const elapsedDays = Math.floor((progressBoundary.getTime() - nextRunAt.getTime()) / DAY_IN_MS)
      const jumpedNextRunAt = addUtcDays(nextRunAt, Math.max(0, elapsedDays))
      return jumpedNextRunAt < progressBoundary ? addUtcDays(jumpedNextRunAt, 1) : jumpedNextRunAt
    }
    case 'WEEKLY': {
      const elapsedWeeks = Math.floor((progressBoundary.getTime() - nextRunAt.getTime()) / WEEK_IN_MS)
      const jumpedNextRunAt = addUtcDays(nextRunAt, Math.max(0, elapsedWeeks) * 7)
      return jumpedNextRunAt < progressBoundary ? addUtcDays(jumpedNextRunAt, 7) : jumpedNextRunAt
    }
    case 'MONTHLY': {
      const monthsBehind = countUtcMonthBoundaryDistance(nextRunAt, progressBoundary)
      const jumpedNextRunAt = monthsBehind > 1
        ? addUtcMonths(nextRunAt, monthsBehind - 1, validated.dayOfMonth)
        : nextRunAt
      return advanceWithinCorrectionLimit(jumpedNextRunAt, progressBoundary, validated)
    }
    case 'YEARLY': {
      const yearsBehind = countUtcYearBoundaryDistance(nextRunAt, progressBoundary)
      const jumpedNextRunAt = yearsBehind > 1
        ? addUtcYears(nextRunAt, yearsBehind - 1, validated.dayOfMonth, validated.monthOfYear)
        : nextRunAt
      return advanceWithinCorrectionLimit(jumpedNextRunAt, progressBoundary, validated)
    }
    default:
      throw new Error(`알 수 없는 반복 주기: ${validated.frequency}`)
  }
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
