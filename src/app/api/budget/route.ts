import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

  const budgets = await prisma.budget.findMany({
    where: { userId: session.user.id, year, month },
    include: { account: { select: { name: true, code: true, type: true } } },
  })

  return NextResponse.json(budgets)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { accountId, year, month, amount } = await request.json()

  if (!accountId || !year || !month || amount === undefined) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  try {
    const budget = await prisma.budget.upsert({
      where: {
        userId_accountId_year_month: {
          userId: session.user.id,
          accountId,
          year,
          month,
        },
      },
      update: { amount },
      create: {
        userId: session.user.id,
        accountId,
        year,
        month,
        amount,
      },
    })
    return NextResponse.json(budget)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '예산 설정에 실패했습니다.' }, { status: 400 })
  }
}
