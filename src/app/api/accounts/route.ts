import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Account } from '@prisma/client'
import { CURRENCY_CODES } from '@/lib/currencies'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const accounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        currency: true,
        description: true,
      },
    })

    const accountIds = accounts.map(a => a.id)

    // Fetch the user's base currency for balance conversion
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { currency: true },
    })
    const baseCurrency = user?.currency ?? 'KRW'

    // 기준 통화 분개는 환율 입력값과 관계없이 원 금액으로, 외화 분개만 환율을 곱해 기준 통화 잔액을 계산합니다.
    const [debitSums, creditSums] = accountIds.length > 0
      ? await Promise.all([
          prisma.$queryRaw<Array<{ debitAccountId: string; total: string }>>`
            SELECT "debitAccountId", SUM(CASE WHEN currency IS NULL OR currency = ${baseCurrency} THEN amount ELSE amount * "exchangeRate" END)::text AS total
            FROM "Entry"
            WHERE "debitAccountId" = ANY(${accountIds}::text[])
            GROUP BY "debitAccountId"
          `,
          prisma.$queryRaw<Array<{ creditAccountId: string; total: string }>>`
            SELECT "creditAccountId", SUM(CASE WHEN currency IS NULL OR currency = ${baseCurrency} THEN amount ELSE amount * "exchangeRate" END)::text AS total
            FROM "Entry"
            WHERE "creditAccountId" = ANY(${accountIds}::text[])
            GROUP BY "creditAccountId"
          `,
        ])
      : [[], []]

    const debitByAccount = new Map(
      debitSums.map(r => [r.debitAccountId, Number(r.total ?? 0)]),
    )
    const creditByAccount = new Map(
      creditSums.map(r => [r.creditAccountId, Number(r.total ?? 0)]),
    )

    const accountsWithBalance = accounts.map(account => {
      const totalDebits = debitByAccount.get(account.id) ?? 0
      const totalCredits = creditByAccount.get(account.id) ?? 0

      let balance = 0
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        balance = totalDebits - totalCredits
      } else {
        balance = totalCredits - totalDebits
      }

      return { ...account, balance, baseCurrency }
    })

    return NextResponse.json(accountsWithBalance)
  } catch (error) {
    console.error('[accounts] GET error:', error)
    return NextResponse.json({ error: '계정 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

const TYPE_CODE_PREFIX: Record<string, number> = {
  ASSET: 1000,
  LIABILITY: 2000,
  EQUITY: 3000,
  REVENUE: 4000,
  EXPENSE: 5000,
}

const OPENING_BALANCE_ALLOWED_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY'])
const OPENING_BALANCE_ACCOUNT_NAME = '개시잔액'
const OPENING_BALANCE_ACCOUNT_DESCRIPTION = '초기잔액 자동 분개용 계정'
const OPENING_BALANCE_ENTRY_DESCRIPTION = '초기잔액 자동 분개'

class AccountApiError extends Error {
  constructor(public readonly apiMessage: string, public readonly apiStatus: number) {
    super(apiMessage)
    this.name = 'AccountApiError'
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id

  let body: { name?: unknown; type?: unknown; description?: unknown; currency?: unknown; openingBalance?: unknown; exchangeRate?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 })
  }

  const { name: nameRaw, type, description, currency } = body
  const accountName = typeof nameRaw === 'string' ? nameRaw.trim() : ''

  try {
    if (!accountName || !type) {
      return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(TYPE_CODE_PREFIX, type as string)) {
      return NextResponse.json({ error: '올바른 계정 유형을 선택해주세요.' }, { status: 400 })
    }

    const accountType = type as string

    if (accountName === OPENING_BALANCE_ACCOUNT_NAME) {
      return NextResponse.json({ error: `'${OPENING_BALANCE_ACCOUNT_NAME}'은 예약된 계정명입니다.` }, { status: 400 })
    }

    // Validate currency if provided
    const accountCurrency = currency ? String(currency) : undefined
    if (accountCurrency && !CURRENCY_CODES.includes(accountCurrency)) {
      return NextResponse.json({ error: '지원하지 않는 통화 코드입니다.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    })
    const baseCurrency = user?.currency ?? 'KRW'
    const finalCurrency = accountCurrency ?? baseCurrency

    const openingBalanceRaw = (body as { openingBalance?: unknown }).openingBalance
    const openingBalance = openingBalanceRaw != null ? Number(openingBalanceRaw) : 0

    if (openingBalanceRaw != null && (!Number.isFinite(openingBalance) || openingBalance < 0)) {
      return NextResponse.json({ error: '초기잔액은 0 이상의 숫자여야 합니다.' }, { status: 400 })
    }

    if (openingBalance > 0 && !OPENING_BALANCE_ALLOWED_TYPES.has(accountType)) {
      return NextResponse.json(
        { error: '초기잔액은 자산, 부채, 자본 계정에만 설정할 수 있습니다.' },
        { status: 400 },
      )
    }

    const openingExchangeRateRaw = body.exchangeRate
    let openingExchangeRate = '1'
    if (openingBalance > 0 && finalCurrency !== baseCurrency) {
      if (openingExchangeRateRaw === undefined || openingExchangeRateRaw === null) {
        return NextResponse.json(
          { error: `외화(${finalCurrency}) 초기잔액에는 환율(exchangeRate)이 필요합니다.` },
          { status: 400 },
        )
      }

      const rawRate = typeof openingExchangeRateRaw === 'number'
        ? String(openingExchangeRateRaw)
        : typeof openingExchangeRateRaw === 'string'
          ? openingExchangeRateRaw.trim()
          : null

      if (rawRate === null || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawRate)) {
        return NextResponse.json({ error: '환율은 양의 숫자 형식이어야 합니다.' }, { status: 400 })
      }

      const rate = Number(rawRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json({ error: '유효한 환율을 입력해주세요.' }, { status: 400 })
      }

      openingExchangeRate = rawRate
    }

    const prefix = String(TYPE_CODE_PREFIX[accountType]).slice(0, 1)
    const base = TYPE_CODE_PREFIX[accountType]
    const upperBound = base + 999

    if (openingBalance > 0) {
      // All code allocation, account creation and entry creation in a single transaction
      // to prevent partial-success and code-collision issues.
      const account = await prisma.$transaction(async (tx) => {
        const equityBase = TYPE_CODE_PREFIX['EQUITY']
        const equityPrefix = String(equityBase)[0]
        const equityUpperBound = equityBase + 999

        // Use findFirst with orderBy for deterministic lookup
        const existingOpeningEquityAccount = await tx.account.findFirst({
          where: { userId, name: OPENING_BALANCE_ACCOUNT_NAME, type: 'EQUITY' },
          orderBy: { createdAt: 'asc' },
        })

        let openingEquityAccount: Account
        let newAccountCode: string

        if (accountType === 'EQUITY' && !existingOpeningEquityAccount) {
          // New account and opening balance account both need codes from the same EQUITY range.
          // Allocate two distinct free codes in one pass to avoid collision.
          const existingCodes = await tx.account.findMany({
            where: { userId, code: { startsWith: equityPrefix } },
            select: { code: true },
          })
          const usedCodes = new Set(
            existingCodes
              .map(a => parseInt(a.code, 10))
              .filter(n => Number.isInteger(n) && n >= equityBase && n <= equityUpperBound),
          )

          let firstFree = equityBase
          while (usedCodes.has(firstFree)) firstFree++
          if (firstFree > equityUpperBound) {
            throw new AccountApiError('개시잔액 계정을 생성할 수 없습니다. 자본 계정 코드가 모두 사용되었습니다.', 409)
          }
          let secondFree = firstFree + 1
          while (secondFree <= equityUpperBound && usedCodes.has(secondFree)) secondFree++
          if (secondFree > equityUpperBound) {
            throw new AccountApiError('해당 계정 유형에 할당 가능한 코드가 모두 사용되었습니다.', 409)
          }

          openingEquityAccount = await tx.account.create({
            data: {
              userId,
              name: OPENING_BALANCE_ACCOUNT_NAME,
              code: String(firstFree),
              type: 'EQUITY',
              currency: finalCurrency,
              description: OPENING_BALANCE_ACCOUNT_DESCRIPTION,
            },
          })
          newAccountCode = String(secondFree)
        } else {
          // 개시잔액 계정 생성에 사용할 다음 자본 계정 코드를 계산합니다.
          const existingEquityAccounts = await tx.account.findMany({
            where: { userId, code: { startsWith: equityPrefix } },
            select: { code: true },
          })
          const usedEquityCodes = new Set(
            existingEquityAccounts
              .map(a => parseInt(a.code, 10))
              .filter(n => Number.isInteger(n) && n >= equityBase && n <= equityUpperBound),
          )

          let firstFreeEquity = equityBase
          while (usedEquityCodes.has(firstFreeEquity)) firstFreeEquity++

          if (!existingOpeningEquityAccount && firstFreeEquity > equityUpperBound) {
            throw new AccountApiError('개시잔액 계정을 생성할 수 없습니다. 자본 계정 코드가 모두 사용되었습니다.', 409)
          }

          // 개시잔액 계정이 아직 없으면 생성합니다.
          openingEquityAccount = existingOpeningEquityAccount ?? await tx.account.create({
            data: {
              userId,
              name: OPENING_BALANCE_ACCOUNT_NAME,
              code: String(firstFreeEquity),
              type: 'EQUITY',
              currency: finalCurrency,
              description: OPENING_BALANCE_ACCOUNT_DESCRIPTION,
            },
          })

          // 트랜잭션 안에서 새 계정 코드를 계산합니다.
          const existingAccounts = await tx.account.findMany({
            where: { userId, code: { startsWith: prefix } },
            select: { code: true },
          })
          const usedCodes = new Set(
            existingAccounts
              .map(a => parseInt(a.code, 10))
              .filter(n => Number.isInteger(n) && n >= base && n <= upperBound),
          )

          let firstFree = base
          while (usedCodes.has(firstFree)) firstFree++

          if (firstFree > upperBound) {
            throw new AccountApiError('해당 계정 유형에 할당 가능한 코드가 모두 사용되었습니다.', 409)
          }

          newAccountCode = String(firstFree)
        }

        const newAccount = await tx.account.create({
          data: {
            userId,
            name: accountName,
            code: newAccountCode,
            type: accountType,
            currency: finalCurrency,
            description: description ? String(description) : undefined,
          },
        })

        // 차변 정상 잔액 유형(자산, 비용): 새 계정 차변 / 개시잔액 자본 대변
        // 대변 정상 잔액 유형(부채, 자본, 수익): 개시잔액 자본 차변 / 새 계정 대변
        const isDebitNormal = accountType === 'ASSET' || accountType === 'EXPENSE'
        const debitAccountId = isDebitNormal ? newAccount.id : openingEquityAccount.id
        const creditAccountId = isDebitNormal ? openingEquityAccount.id : newAccount.id

        await tx.transaction.create({
          data: {
            userId,
            date: new Date(),
            description: `${accountName} ${OPENING_BALANCE_ACCOUNT_NAME}`,
            entries: {
              create: [{
                debitAccountId,
                creditAccountId,
                amount: openingBalance,
                currency: finalCurrency,
                exchangeRate: openingExchangeRate,
                description: OPENING_BALANCE_ENTRY_DESCRIPTION,
              }],
            },
          },
        })

        return newAccount
      })

      return NextResponse.json(account, { status: 201 })
    }

    // No opening balance — compute code and create account
    const existingAccounts = await prisma.account.findMany({
      where: { userId, code: { startsWith: prefix } },
      select: { code: true },
    })
    const usedCodes = new Set(
      existingAccounts
        .map(a => parseInt(a.code, 10))
        .filter(n => Number.isInteger(n) && n >= base && n <= upperBound),
    )

    let firstFree = base
    while (usedCodes.has(firstFree)) firstFree++

    if (firstFree > upperBound) {
      return NextResponse.json(
        { error: '해당 계정 유형에 할당 가능한 코드가 모두 사용되었습니다.' },
        { status: 409 },
      )
    }

    const code = String(firstFree)
    const account = await prisma.account.create({
      data: {
        userId,
        name: accountName,
        code,
        type: accountType,
        currency: finalCurrency,
        description: description ? String(description) : undefined,
      },
    })
    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    if (error instanceof AccountApiError) {
      return NextResponse.json({ error: error.apiMessage }, { status: error.apiStatus })
    }
    if (error instanceof Error && 'code' in error) {
      const prismaCode = (error as { code: string }).code
      if (prismaCode === 'P2002') {
        return NextResponse.json(
          { error: '계정 생성 중 중복이 발생했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 409 },
        )
      }
      if (prismaCode === 'P2003') {
        return NextResponse.json(
          { error: '연결된 사용자 정보를 찾을 수 없어 계정을 생성할 수 없습니다.' },
          { status: 409 },
        )
      }
    }
    console.error('Account creation error:', error)
    return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 })
  }
}
