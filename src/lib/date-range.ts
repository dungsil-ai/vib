export function makeUTCDate(
  year: number,
  monthIndex: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  date.setUTCHours(hours, minutes, seconds, milliseconds)
  return date
}

export function makeUTCMonthRange(year: number, month: number): { gte: Date; lte: Date } {
  return {
    gte: makeUTCDate(year, month - 1, 1),
    lte: makeUTCDate(year, month, 0, 23, 59, 59, 999),
  }
}

export function parseUTCDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = makeUTCDate(year, month - 1, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

export function parseUTCEndOfDay(value: string): Date | null {
  const date = parseUTCDateOnly(value)
  if (!date) {
    return null
  }

  date.setUTCHours(23, 59, 59, 999)
  return date
}
