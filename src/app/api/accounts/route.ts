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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { name, code, type, description } = await request.json()

  if (!name || !code || !type) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  try {
    const account = await prisma.account.create({
      data: {
        userId: session.user.id,
        name,
        code,
        type,
        description,
      },
    })
    return NextResponse.json(account, { status: 201 })
  } catch {
    return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 400 })
  }
}
