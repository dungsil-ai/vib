import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const { amount } = await request.json()

  if (amount === undefined) {
    return NextResponse.json({ error: '금액을 입력해주세요.' }, { status: 400 })
  }
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return NextResponse.json({ error: '유효한 금액을 입력해주세요.' }, { status: 400 })
  }

  const budget = await prisma.budget.updateMany({
    where: { id, userId: session.user.id },
    data: { amount },
  })

  if (budget.count === 0) {
    return NextResponse.json({ error: '예산을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ message: '업데이트되었습니다.' })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const budget = await prisma.budget.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (budget.count === 0) {
    return NextResponse.json({ error: '예산을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ message: '삭제되었습니다.' })
}
