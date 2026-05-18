import { describe, it, expect } from 'vitest'
import { computeInitialNextRunAt, computeNextRunAt } from '@/lib/recurring'

describe('computeNextRunAt', () => {
  describe('DAILY', () => {
    it('하루를 더한다', () => {
      const from = new Date('2024-03-15T00:00:00.000Z')
      const result = computeNextRunAt('DAILY', null, null, from)
      expect(result.getUTCDate()).toBe(16)
      expect(result.getUTCMonth()).toBe(2) // March
    })

    it('월말 경계를 넘긴다', () => {
      const from = new Date('2024-01-31T00:00:00.000Z')
      const result = computeNextRunAt('DAILY', null, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(1)
    })
  })

  describe('WEEKLY', () => {
    it('7일을 더한다', () => {
      const from = new Date('2024-03-15T00:00:00.000Z')
      const result = computeNextRunAt('WEEKLY', null, null, from)
      expect(result.getUTCDate()).toBe(22)
      expect(result.getUTCMonth()).toBe(2)
    })

    it('주 경계를 넘긴다', () => {
      const from = new Date('2024-03-29T00:00:00.000Z')
      const result = computeNextRunAt('WEEKLY', null, null, from)
      expect(result.getUTCMonth()).toBe(3) // April
      expect(result.getUTCDate()).toBe(5)
    })
  })

  describe('MONTHLY', () => {
    it('한 달을 더한다', () => {
      const from = new Date('2024-01-15T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', null, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(15)
    })

    it('dayOfMonth가 없어도 월말에서는 다음 달 말일로 보정된다', () => {
      const from = new Date('2024-01-31T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', null, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(29) // 2024 is leap year
    })

    it('dayOfMonth를 지정하면 해당 일로 설정된다', () => {
      const from = new Date('2024-01-01T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', 25, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(25)
    })

    it('2월에 dayOfMonth=31이면 월말(28/29일)로 조정된다', () => {
      const from = new Date('2024-01-31T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', 31, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(29) // 2024 is leap year
    })

    it('윤년이 아닌 2월에 dayOfMonth=29이면 28일로 조정된다', () => {
      const from = new Date('2023-01-31T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', 29, null, from)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(28)
    })

    it('연말 경계를 넘긴다', () => {
      const from = new Date('2024-12-15T00:00:00.000Z')
      const result = computeNextRunAt('MONTHLY', null, null, from)
      expect(result.getUTCFullYear()).toBe(2025)
      expect(result.getUTCMonth()).toBe(0) // January
    })
  })

  describe('YEARLY', () => {
    it('1년을 더한다', () => {
      const from = new Date('2024-06-15T00:00:00.000Z')
      const result = computeNextRunAt('YEARLY', null, null, from)
      expect(result.getUTCFullYear()).toBe(2025)
      expect(result.getUTCMonth()).toBe(5) // June
    })

    it('윤년 2월 29일에서 1년 뒤는 2월 28일로 보정된다', () => {
      const from = new Date('2024-02-29T00:00:00.000Z')
      const result = computeNextRunAt('YEARLY', null, null, from)
      expect(result.getUTCFullYear()).toBe(2025)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(28)
    })

    it('monthOfYear와 dayOfMonth를 지정하면 해당 날짜로 설정된다', () => {
      const from = new Date('2024-01-01T00:00:00.000Z')
      const result = computeNextRunAt('YEARLY', 15, 3, from)
      expect(result.getUTCFullYear()).toBe(2025)
      expect(result.getUTCMonth()).toBe(2) // March (0-indexed)
      expect(result.getUTCDate()).toBe(15)
    })

    it('윤년에서 비윤년으로 2월 29일을 가리키면 28일로 조정된다', () => {
      const from = new Date('2024-02-29T00:00:00.000Z')
      const result = computeNextRunAt('YEARLY', 29, 2, from)
      expect(result.getUTCFullYear()).toBe(2025)
      expect(result.getUTCMonth()).toBe(1) // February
      expect(result.getUTCDate()).toBe(28)
    })
  })

  describe('잘못된 frequency', () => {
    it('알 수 없는 값이면 에러를 throw한다', () => {
      const from = new Date('2024-01-01T00:00:00.000Z')
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        computeNextRunAt('INVALID' as any, null, null, from),
      ).toThrow('알 수 없는 반복 주기: INVALID')
    })
  })
})

describe('computeInitialNextRunAt', () => {
  it('일 반복은 시작일을 최초 실행일로 사용한다', () => {
    const startDate = new Date('2024-03-15T09:30:00.000Z')
    const result = computeInitialNextRunAt('DAILY', null, null, startDate)

    expect(result.toISOString()).toBe('2024-03-15T09:30:00.000Z')
  })

  it('월 반복은 UTC 기준으로 같은 달의 지정일을 계산한다', () => {
    const startDate = new Date('2024-03-30T23:30:00.000Z')
    const result = computeInitialNextRunAt('MONTHLY', 31, null, startDate)

    expect(result.toISOString()).toBe('2024-03-31T23:30:00.000Z')
  })

  it('월 반복 지정일이 시작일보다 이전이면 UTC 기준 다음 달로 넘긴다', () => {
    const startDate = new Date('2024-03-31T23:30:00.000Z')
    const result = computeInitialNextRunAt('MONTHLY', 30, null, startDate)

    expect(result.toISOString()).toBe('2024-04-30T23:30:00.000Z')
  })

  it('연 반복은 UTC 기준 지정 월일이 지나지 않았으면 해당 연도를 사용한다', () => {
    const startDate = new Date('2024-03-30T23:30:00.000Z')
    const result = computeInitialNextRunAt('YEARLY', 31, 3, startDate)

    expect(result.toISOString()).toBe('2024-03-31T23:30:00.000Z')
  })

  it('연 반복 지정 월일이 시작일보다 이전이면 UTC 기준 다음 해로 넘긴다', () => {
    const startDate = new Date('2024-03-31T23:30:00.000Z')
    const result = computeInitialNextRunAt('YEARLY', 30, 3, startDate)

    expect(result.toISOString()).toBe('2025-03-30T23:30:00.000Z')
  })

  it('연 반복은 UTC 기준으로 존재하지 않는 날짜를 월말로 보정한다', () => {
    const startDate = new Date('2023-02-28T12:00:00.000Z')
    const result = computeInitialNextRunAt('YEARLY', 29, 2, startDate)

    expect(result.toISOString()).toBe('2023-02-28T12:00:00.000Z')
  })
})
