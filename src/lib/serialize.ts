import { Prisma } from '@prisma/client'

/**
 * Converts Prisma.Decimal values to plain JS numbers so they serialize
 * correctly as JSON numbers (not strings) in API responses.
 * Note: Prisma.Decimal fields in the result are replaced with number values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeData(data: unknown): any {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (value instanceof Prisma.Decimal) {
        return Number(value)
      }
      return value
    }),
  )
}
