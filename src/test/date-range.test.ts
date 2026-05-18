import { describe, expect, it } from 'vitest'
import { makeUTCDate, makeUTCMonthRange, parseUTCDateOnly, parseUTCEndOfDay } from '@/lib/date-range'

describe('UTC 날짜 범위 유틸리티', () => {
  it('UTC 기준 날짜를 생성한다', () => {
    expect(makeUTCDate(2024, 0, 15).toISOString()).toBe('2024-01-15T00:00:00.000Z')
  })

  it('월 시작과 끝을 UTC 기준으로 생성한다', () => {
    const range = makeUTCMonthRange(2024, 2)
    expect(range.gte.toISOString()).toBe('2024-02-01T00:00:00.000Z')
    expect(range.lte.toISOString()).toBe('2024-02-29T23:59:59.999Z')
  })

  it('날짜 문자열을 UTC 시작 시각으로 파싱한다', () => {
    expect(parseUTCDateOnly('2024-01-15')?.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(parseUTCDateOnly('2024-1-5')?.toISOString()).toBe('2024-01-05T00:00:00.000Z')
  })

  it('날짜 문자열을 UTC 종료 시각으로 파싱한다', () => {
    expect(parseUTCEndOfDay('2024-01-15')?.toISOString()).toBe('2024-01-15T23:59:59.999Z')
  })

  it('존재하지 않는 날짜를 거부한다', () => {
    expect(parseUTCDateOnly('2024-02-30')).toBeNull()
    expect(parseUTCEndOfDay('2024-13-01')).toBeNull()
  })
})
