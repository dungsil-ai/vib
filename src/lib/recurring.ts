export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/**
 * 주어진 날짜로부터 다음 반복 실행 날짜를 계산합니다.
 */
export function computeNextRunAt(
  frequency: RecurringFrequency,
  dayOfMonth: number | null,
  monthOfYear: number | null,
  from: Date,
): Date {
  const d = new Date(from)

  const getUtcMonthLastDay = (year: number, monthIndex: number) =>
    new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  switch (frequency) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'MONTHLY': {
      const sourceDay = dayOfMonth ?? d.getUTCDate()
      const currentMonthIndex = d.getUTCMonth()
      const targetMonthIndex = (currentMonthIndex + 1) % 12
      const targetYear = d.getUTCFullYear() + (currentMonthIndex === 11 ? 1 : 0)
      const targetDay = Math.min(sourceDay, getUtcMonthLastDay(targetYear, targetMonthIndex))

      d.setUTCFullYear(targetYear, targetMonthIndex, targetDay)
      break
    }
    case 'YEARLY': {
      const targetYear = d.getUTCFullYear() + 1
      const targetMonthIndex = monthOfYear ? monthOfYear - 1 : d.getUTCMonth()
      const sourceDay = dayOfMonth ?? d.getUTCDate()
      const targetDay = Math.min(sourceDay, getUtcMonthLastDay(targetYear, targetMonthIndex))

      d.setUTCFullYear(targetYear, targetMonthIndex, targetDay)
      break
    }
    default: {
      const _exhaustive: never = frequency
      throw new Error(`알 수 없는 반복 주기: ${_exhaustive}`)
    }
  }
  return d
}
