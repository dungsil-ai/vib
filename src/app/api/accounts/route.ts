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
    include: {
      debitEntries: { select: { amount: true } },
      creditEntries: { select: { amount: true } },
    },
  })

  const accountsWithBalance = accounts.map(account => {
    const totalDebits = account.debitEntries.reduce((sum, e) => sum + Number(e.amount), 0)
    const totalCredits = account.creditEntries.reduce((sum, e) => sum + Number(e.amount), 0)
    
    let balance = 0
    if (account.type === 'ASSET' || account.type === 'EXPENSE') {
      balance = totalDebits - totalCredits
    } else {
      balance = totalCredits - totalDebits
    }

    return {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      description: account.description,
      balance,
    }
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
