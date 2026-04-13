export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

function getLastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function clampToUtcMonth(date: Date, monthOffset: number, dayOfMonth?: number | null) {
  const nextDate = new Date(date)
  const targetDay = dayOfMonth ?? nextDate.getUTCDate()

  nextDate.setUTCDate(1)
  nextDate.setUTCMonth(nextDate.getUTCMonth() + monthOffset)

  const maxDay = getLastDayOfMonthUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth())
  nextDate.setUTCDate(Math.min(targetDay, maxDay))

  return nextDate
}

/**
 * 주어진 날짜로부터 다음 반복 실행 날짜를 계산합니다.
 */
export function computeNextRunAt(
  frequency: RecurringFrequency,
  dayOfMonth: number | null,
  monthOfYear: number | null,
  from: Date,
): Date {
  switch (frequency) {
    case 'DAILY':
      return new Date(from.getTime() + 24 * 60 * 60 * 1000)
    case 'WEEKLY':
      return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
    case 'MONTHLY': {
      return clampToUtcMonth(from, 1, dayOfMonth)
    }
    case 'YEARLY': {
      const nextDate = new Date(from)
      const targetDay = dayOfMonth ?? nextDate.getUTCDate()

      nextDate.setUTCDate(1)
      nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1)
      if (monthOfYear) {
        nextDate.setUTCMonth(monthOfYear - 1)
      }

      const maxDay = getLastDayOfMonthUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth())
      nextDate.setUTCDate(Math.min(targetDay, maxDay))

      return nextDate
    }
    default: {
      const _exhaustive: never = frequency
      throw new Error(`알 수 없는 반복 주기: ${_exhaustive}`)
    }
  }
}
