import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { serializeData } from '@/lib/serialize'

describe('serializeData', () => {
  it('일반 객체를 그대로 반환한다', () => {
    const input = { name: '테스트', value: 123 }
    expect(serializeData(input)).toEqual(input)
  })

  it('Prisma.Decimal 값을 문자열로 변환한다', () => {
    const input = { amount: new Prisma.Decimal('12345.67') }
    const result = serializeData(input)
    expect(result.amount).toBe('12345.67')
    expect(typeof result.amount).toBe('string')
  })

  it('중첩된 객체 내의 Prisma.Decimal도 변환한다', () => {
    const input = {
      transaction: {
        id: 'abc',
        entries: [
          { accountId: '1', amount: new Prisma.Decimal('100') },
          { accountId: '2', amount: new Prisma.Decimal('-100') },
        ],
      },
    }
    const result = serializeData(input)
    expect(typeof result.transaction.entries[0].amount).toBe('string')
    expect(typeof result.transaction.entries[1].amount).toBe('string')
    expect(Number(result.transaction.entries[0].amount)).toBe(100)
    expect(Number(result.transaction.entries[1].amount)).toBe(-100)
  })

  it('null과 undefined를 처리한다', () => {
    expect(serializeData(null)).toBeNull()
    expect(serializeData({ a: null })).toEqual({ a: null })
  })

  it('배열을 처리한다', () => {
    const input = [new Prisma.Decimal('1.5'), new Prisma.Decimal('2.5')]
    const result = serializeData(input)
    expect(result).toEqual(['1.5', '2.5'])
  })

  it('숫자 정밀도를 유지한다', () => {
    const input = { amount: new Prisma.Decimal('9999999999999.99') }
    const result = serializeData(input)
    expect(result.amount).toBe('9999999999999.99')
  })
})
