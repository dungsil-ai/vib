import { describe, expect, it } from 'vitest'
import { getUtcMonthRange } from '@/lib/date-range'

describe('getUtcMonthRange', () => {
  it('UTC 반개구간 경계를 반환한다', () => {
    const now = new Date('2026-03-31T23:59:59.999Z')

    const { year, month, startOfMonth, nextMonthStart } = getUtcMonthRange(now)

    expect(year).toBe(2026)
    expect(month).toBe(3)
    expect(startOfMonth.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(nextMonthStart.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(startOfMonth.getTime()).toBeLessThan(nextMonthStart.getTime())
  })

  it('연도 경계에서도 올바른 다음 달 시작을 계산한다', () => {
    const now = new Date('2026-12-15T12:00:00.000Z')

    const { year, month, startOfMonth, nextMonthStart } = getUtcMonthRange(now)

    expect(year).toBe(2026)
    expect(month).toBe(12)
    expect(startOfMonth.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(nextMonthStart.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
