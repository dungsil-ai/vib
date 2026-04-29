import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CURRENCY_CODES } from '@/lib/currencies'

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

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function validateAndNormalizeCurrency(currency: unknown) {
  if (currency === undefined || currency === null) {
    return { ok: true as const }
  }

  if (typeof currency !== 'string') {
    return {
      ok: false as const,
      response: errorResponse('통화 코드는 문자열이어야 합니다.'),
    }
  }

  const normalizedCurrency = currency.trim().toUpperCase()
  if (!normalizedCurrency || !CURRENCY_CODES.includes(normalizedCurrency)) {
    return {
      ok: false as const,
      response: errorResponse('지원하지 않는 통화 코드입니다.'),
    }
  }

  return { ok: true as const, currency: normalizedCurrency }
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
      response: errorResponse('필수 필드를 입력해주세요.'),
    }
  }

  if (typeof payload.description !== 'string') {
    return {
      ok: false as const,
      response: errorResponse('거래 설명은 문자열이어야 합니다.'),
    }
  }

  const parsedDate = new Date(payload.date instanceof Date ? payload.date : String(payload.date))
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      ok: false as const,
      response: errorResponse('유효한 날짜를 입력해주세요.'),
    }
  }

  const normalizedEntries: TransactionEntryInput[] = []

  for (const entry of payload.entries) {
    if (!entry || typeof entry !== 'object') {
      return {
        ok: false as const,
        response: errorResponse('각 항목의 차변·대변 계정과 금액을 입력해주세요.'),
      }
    }

    const candidate = entry as Record<string, unknown>
    if (!candidate.debitAccountId || !candidate.creditAccountId || candidate.amount == null) {
      return {
        ok: false as const,
        response: errorResponse('각 항목의 차변·대변 계정과 금액을 입력해주세요.'),
      }
    }

    const amount = Number(candidate.amount)
    if (!Number.isFinite(amount)) {
      return {
        ok: false as const,
        response: errorResponse('유효한 거래 금액을 입력해주세요.'),
      }
    }
    if (amount <= 0) {
      return {
        ok: false as const,
        response: errorResponse('거래 금액은 0보다 커야 합니다.'),
      }
    }
    if (candidate.debitAccountId === candidate.creditAccountId) {
      return {
        ok: false as const,
        response: errorResponse('차변 계정과 대변 계정은 달라야 합니다.'),
      }
    }

    const normalizedCurrency = validateAndNormalizeCurrency(candidate.currency)
    if (!normalizedCurrency.ok) {
      return normalizedCurrency
    }

    if (candidate.exchangeRate !== undefined) {
      const rate = Number(candidate.exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        return {
          ok: false as const,
          response: errorResponse('유효한 환율을 입력해주세요.'),
        }
      }
    }

    normalizedEntries.push({
      debitAccountId: String(candidate.debitAccountId),
      creditAccountId: String(candidate.creditAccountId),
      amount: String(candidate.amount),
      currency: normalizedCurrency.currency,
      exchangeRate: candidate.exchangeRate === undefined ? undefined : String(candidate.exchangeRate),
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
      response: errorResponse('잘못된 계정이 포함되어 있습니다.', 403),
    }
  }

  const baseCurrency = userRecord?.currency ?? 'KRW'

  for (const entry of normalizedEntries) {
    const entryCurrency = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return {
        ok: false as const,
        response: errorResponse(`외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.`),
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
