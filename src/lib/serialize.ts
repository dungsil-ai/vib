import { Prisma } from '@prisma/client'

/**
 * Converts Prisma.Decimal values to strings so they serialize correctly
 * in API responses without any floating-point precision loss.
 * Consumers must call Number() / parseFloat() when arithmetic is needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeData(data: unknown): any {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (value instanceof Prisma.Decimal) {
        return value.toString()
      }
      return value
    }),
  )
}
