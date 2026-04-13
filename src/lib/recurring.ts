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
  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1)
      break
    case 'WEEKLY':
      d.setDate(d.getDate() + 7)
      break
    case 'MONTHLY': {
      d.setMonth(d.getMonth() + 1)
      if (dayOfMonth) {
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        d.setDate(Math.min(dayOfMonth, maxDay))
      }
      break
    }
    case 'YEARLY': {
      d.setFullYear(d.getFullYear() + 1)
      if (monthOfYear) {
        d.setMonth(monthOfYear - 1)
      }
      if (dayOfMonth) {
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        d.setDate(Math.min(dayOfMonth, maxDay))
      }
      break
    }
    default: {
      const _exhaustive: never = frequency
      throw new Error(`알 수 없는 반복 주기: ${_exhaustive}`)
    }
  }
  return d
}
