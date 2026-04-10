import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { AccountType } from '@prisma/client'
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const { name, type, description } = await request.json()

    if (!name || !type) {
      return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(TYPE_CODE_PREFIX, type)) {
      return NextResponse.json({ error: '올바른 계정 유형을 선택해주세요.' }, { status: 400 })
    }

    // Auto-generate the code: find the highest existing code within this type's numeric range
    const prefix = String(TYPE_CODE_PREFIX[type]).slice(0, 1)
    const base = TYPE_CODE_PREFIX[type]
    const upperBound = base + 999
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
        name,
        code,
        type: type as AccountType,
        description: description || undefined,
      },
    })
    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const prismaCode = (error as { code: string }).code
      if (prismaCode === 'P2002') {
        return NextResponse.json({ error: '이미 존재하는 계정 코드입니다.' }, { status: 409 })
      }
      if (prismaCode === 'P2003') {
        return NextResponse.json({ error: '인증이 만료되었습니다. 다시 로그인해주세요.' }, { status: 401 })
      }
    }
    console.error('Account creation error:', error)
    return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 })
  }
}
