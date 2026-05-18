import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CURRENCY_CODES } from '@/lib/currencies'

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse }

export type AuthenticatedHandler = (request: NextRequest, userId: string) => Promise<Response> | Response

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function apiData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return apiError('인증이 필요합니다.', 401)
    }

    return handler(request, session.user.id)
  }
}

export function normalizeCurrencyCode(currency: unknown): ApiResult<string | undefined> {
  if (currency === undefined || currency === null || currency === '') {
    return { ok: true, value: undefined }
  }

  if (typeof currency !== 'string') {
    return { ok: false, response: apiError('통화 코드는 문자열이어야 합니다.') }
  }

  const normalizedCurrency = currency.trim().toUpperCase()
  if (!normalizedCurrency || !CURRENCY_CODES.includes(normalizedCurrency)) {
    return { ok: false, response: apiError('지원하지 않는 통화 코드입니다.') }
  }

  return { ok: true, value: normalizedCurrency }
}

export function parseStrictNumber(value: unknown, label: string): ApiResult<number> {
  const raw = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : null

  if (raw === null || raw === '' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
    return { ok: false, response: apiError(`유효한 ${label} 값을 입력해주세요.`) }
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return { ok: false, response: apiError(`유효한 ${label} 값을 입력해주세요.`) }
  }

  return { ok: true, value: parsed }
}

export function parseStrictInteger(value: unknown, label: string): ApiResult<number> {
  const raw = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : null

  if (raw === null || raw === '' || !/^\d+$/.test(raw)) {
    return { ok: false, response: apiError(`유효한 ${label} 값을 입력해주세요.`) }
  }

  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, response: apiError(`유효한 ${label} 값을 입력해주세요.`) }
  }

  return { ok: true, value: parsed }
}
