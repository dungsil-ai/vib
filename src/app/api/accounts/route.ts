import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      description: true,
    },
  })

  const accountIds = accounts.map(a => a.id)

  const [debitSums, creditSums] = await Promise.all([
    prisma.entry.groupBy({
      by: ['debitAccountId'],
      where: { debitAccountId: { in: accountIds } },
      _sum: { amount: true },
    }),
    prisma.entry.groupBy({
      by: ['creditAccountId'],
      where: { creditAccountId: { in: accountIds } },
      _sum: { amount: true },
    }),
  ])

  const debitByAccount = new Map(
    debitSums.map(r => [r.debitAccountId, Number(r._sum.amount ?? 0)]),
  )
  const creditByAccount = new Map(
    creditSums.map(r => [r.creditAccountId, Number(r._sum.amount ?? 0)]),
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

    return { ...account, balance }
  })

  return NextResponse.json(accountsWithBalance)
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

  let body: { name?: unknown; type?: unknown; description?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 })
  }

  const { name, type, description } = body

  try {
    if (!name || !type) {
      return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(TYPE_CODE_PREFIX, type as string)) {
      return NextResponse.json({ error: '올바른 계정 유형을 선택해주세요.' }, { status: 400 })
    }

    const openingBalanceRaw = (body as { openingBalance?: unknown }).openingBalance
    const openingBalance = openingBalanceRaw != null ? Number(openingBalanceRaw) : 0

    if (openingBalanceRaw != null && (!Number.isFinite(openingBalance) || openingBalance < 0)) {
      return NextResponse.json({ error: '초기잔액은 0 이상의 숫자여야 합니다.' }, { status: 400 })
    }

    const accountType = type as string
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

        let openingEquityAccount = await tx.account.findFirst({
          where: { userId, name: OPENING_BALANCE_ACCOUNT_NAME, type: 'EQUITY' },
        })

        let newAccountCode: string

        if (accountType === 'EQUITY' && !openingEquityAccount) {
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
              description: OPENING_BALANCE_ACCOUNT_DESCRIPTION,
            },
          })
          newAccountCode = String(secondFree)
        } else {
          if (!openingEquityAccount) {
            const existingEquityAccounts = await tx.account.findMany({
              where: { userId, code: { startsWith: equityPrefix } },
              select: { code: true },
            })
            const maxEquityCode = existingEquityAccounts
              .map(a => parseInt(a.code, 10))
              .filter(n => Number.isInteger(n) && n >= equityBase && n <= equityUpperBound)
              .reduce((max, n) => Math.max(max, n), equityBase - 1)
            const nextEquityNum = maxEquityCode + 1

            if (nextEquityNum > equityUpperBound) {
              throw new AccountApiError('개시잔액 계정을 생성할 수 없습니다. 자본 계정 코드가 모두 사용되었습니다.', 409)
            }

            openingEquityAccount = await tx.account.create({
              data: {
                userId,
                name: OPENING_BALANCE_ACCOUNT_NAME,
                code: String(nextEquityNum),
                type: 'EQUITY',
                description: OPENING_BALANCE_ACCOUNT_DESCRIPTION,
              },
            })
          }

          // Compute code for the new account inside the transaction
          const existingAccounts = await tx.account.findMany({
            where: { userId, code: { startsWith: prefix } },
            select: { code: true },
          })
          const maxCode = existingAccounts
            .map(a => parseInt(a.code, 10))
            .filter(n => Number.isInteger(n) && n >= base && n <= upperBound)
            .reduce((max, n) => Math.max(max, n), base - 1)
          const nextNum = maxCode + 1

          if (nextNum > upperBound) {
            throw new AccountApiError('해당 계정 유형에 할당 가능한 코드가 모두 사용되었습니다.', 409)
          }

          newAccountCode = String(nextNum)
        }

        const newAccount = await tx.account.create({
          data: {
            userId,
            name: name as string,
            code: newAccountCode,
            type: accountType,
            description: description ? String(description) : undefined,
          },
        })

        // Debit-normal types (ASSET, EXPENSE): Dr. new account / Cr. opening equity
        // Credit-normal types (LIABILITY, EQUITY, REVENUE): Dr. opening equity / Cr. new account
        const isDebitNormal = accountType === 'ASSET' || accountType === 'EXPENSE'
        const debitAccountId = isDebitNormal ? newAccount.id : openingEquityAccount.id
        const creditAccountId = isDebitNormal ? openingEquityAccount.id : newAccount.id

        await tx.transaction.create({
          data: {
            userId,
            date: new Date(),
            description: `${name as string} ${OPENING_BALANCE_ACCOUNT_NAME}`,
            entries: {
              create: [{
                debitAccountId,
                creditAccountId,
                amount: openingBalance,
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
    const maxCode = existingAccounts
      .map(a => parseInt(a.code, 10))
      .filter(n => Number.isInteger(n) && n >= base && n <= upperBound)
      .reduce((max, n) => Math.max(max, n), base - 1)
    const nextNum = maxCode + 1

    if (nextNum > upperBound) {
      return NextResponse.json(
        { error: '해당 계정 유형에 할당 가능한 코드가 모두 사용되었습니다.' },
        { status: 409 },
      )
    }

    const code = String(nextNum)
    const account = await prisma.account.create({
      data: {
        userId,
        name: name as string,
        code,
        type: accountType,
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
