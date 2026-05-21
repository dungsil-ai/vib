import { prisma } from '@/lib/prisma'
import { apiError, normalizeCurrencyCode, parseStrictNumber } from '@/lib/api'

export type TransactionEntryInput = {
  debitAccountId: string
  creditAccountId: string
  amount: string
  currency?: string
  exchangeRate?: string
  description?: string
}

export const TRANSACTION_ENTRY_INCLUDE = {
  entries: {
    include: {
      debitAccount: { select: { name: true, code: true, type: true } },
      creditAccount: { select: { name: true, code: true, type: true } },
    },
  },
} as const

function parseExchangeRateInternal(exchangeRate: unknown) {
  if (exchangeRate === undefined || exchangeRate === null) {
    return { ok: true as const }
  }

  const parsed = parseStrictNumber(exchangeRate, '환율')
  if (!parsed.ok) {
    return { ok: false as const, response: apiError('환율은 양의 숫자 형식이어야 합니다.') }
  }

  if (parsed.value <= 0) {
    return { ok: false as const, response: apiError('유효한 환율을 입력해주세요.') }
  }

  if (typeof exchangeRate === 'number') {
    return {
      ok: true as const,
      exchangeRate: parsed.value.toLocaleString('en-US', {
        useGrouping: false,
        maximumSignificantDigits: 21,
      }),
    }
  }

  return { ok: true as const, exchangeRate: String(exchangeRate).trim() }
}


export async function validateTransactionPayload(userId: string, body: unknown) {
  const payload = body as {
    date?: unknown
    description?: unknown
    entries?: unknown
  }

  if (!payload.date || !payload.description || !payload.entries || !Array.isArray(payload.entries) || payload.entries.length === 0) {
    return {
      ok: false as const,
      response: apiError('필수 필드를 입력해주세요.'),
    }
  }

  if (typeof payload.description !== 'string') {
    return {
      ok: false as const,
      response: apiError('거래 설명은 문자열이어야 합니다.'),
    }
  }

  const parsedDate = new Date(payload.date instanceof Date ? payload.date : String(payload.date))
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      ok: false as const,
      response: apiError('유효한 날짜를 입력해주세요.'),
    }
  }

  const normalizedEntries: TransactionEntryInput[] = []

  for (const entry of payload.entries) {
    if (!entry || typeof entry !== 'object') {
      return {
        ok: false as const,
        response: apiError('각 항목의 차변·대변 계정과 금액을 입력해주세요.'),
      }
    }

    const candidate = entry as Record<string, unknown>
    if (!candidate.debitAccountId || !candidate.creditAccountId || candidate.amount == null) {
      return {
        ok: false as const,
        response: apiError('각 항목의 차변·대변 계정과 금액을 입력해주세요.'),
      }
    }

    const parsedAmount = parseStrictNumber(candidate.amount, '거래 금액')
    if (!parsedAmount.ok) {
      return {
        ok: false as const,
        response: apiError('유효한 거래 금액을 입력해주세요.'),
      }
    }
    const amount = parsedAmount.value
    if (amount <= 0) {
      return {
        ok: false as const,
        response: apiError('거래 금액은 0보다 커야 합니다.'),
      }
    }
    if (candidate.debitAccountId === candidate.creditAccountId) {
      return {
        ok: false as const,
        response: apiError('차변 계정과 대변 계정은 달라야 합니다.'),
      }
    }

    const normalizedCurrency = normalizeCurrencyCode(candidate.currency)
    if (!normalizedCurrency.ok) {
      return normalizedCurrency
    }

    const normalizedExchangeRate = parseExchangeRateInternal(candidate.exchangeRate)
    if (!normalizedExchangeRate.ok) return normalizedExchangeRate

    normalizedEntries.push({
      debitAccountId: String(candidate.debitAccountId),
      creditAccountId: String(candidate.creditAccountId),
      amount: String(parsedAmount.value),
      currency: normalizedCurrency.value,
      exchangeRate: normalizedExchangeRate.exchangeRate,
      description: typeof candidate.description === 'string' ? candidate.description : undefined,
    })
  }

  const accountIds = Array.from(
    new Set([
      ...normalizedEntries.map(entry => entry.debitAccountId),
      ...normalizedEntries.map(entry => entry.creditAccountId),
    ]),
  )

  const [ownedAccounts, userRecord] = await Promise.all([
    prisma.account.findMany({
      where: { id: { in: accountIds }, userId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    }),
  ])

  if (ownedAccounts.length !== accountIds.length) {
    return {
      ok: false as const,
      response: apiError('잘못된 계정이 포함되어 있습니다.', 403),
    }
  }

  const baseCurrency = userRecord?.currency ?? 'KRW'

  for (const entry of normalizedEntries) {
    const entryCurrency = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return {
        ok: false as const,
        response: apiError(`외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.`),
      }
    }
  }

  return {
    ok: true as const,
    value: {
      parsedDate,
      description: payload.description,
      normalizedEntries,
      baseCurrency,
    },
  }
}
