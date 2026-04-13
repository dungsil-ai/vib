import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.recurringTransaction.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: '반복 거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await request.json()
  const { isActive } = body

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive 값이 필요합니다.' }, { status: 400 })
  }

  const updated = await prisma.recurringTransaction.update({
    where: { id },
    data: { isActive },
    include: {
      entries: {
        include: {
          debitAccount: { select: { name: true, code: true, type: true } },
          creditAccount: { select: { name: true, code: true, type: true } },
        },
      },
    },
  })

  return NextResponse.json(serializeData(updated))
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const deleted = await prisma.recurringTransaction.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (deleted.count === 0) {
    return NextResponse.json({ error: '반복 거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ message: '삭제되었습니다.' })
}
