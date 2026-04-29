import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { TRANSACTION_ENTRY_INCLUDE, validateTransactionPayload } from '../shared'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  const validatedPayload = await validateTransactionPayload(session.user.id, await request.json())
  if (!validatedPayload.ok) {
    return validatedPayload.response
  }

  const { parsedDate, description, normalizedEntries, baseCurrency } = validatedPayload.value

  try {
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        date: parsedDate,
        description,
        entries: {
          deleteMany: {},
          create: normalizedEntries.map(entry => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
            currency: entry.currency ?? baseCurrency,
            exchangeRate: entry.exchangeRate ?? '1',
            description: entry.description,
          })),
        },
      },
      include: TRANSACTION_ENTRY_INCLUDE,
    })

    return NextResponse.json(serializeData(transaction))
  } catch (error) {
    console.error('Failed to update transaction', { transactionId: id, userId: session.user.id, error })
    return NextResponse.json({ error: '거래 수정에 실패했습니다.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const transaction = await prisma.transaction.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (transaction.count === 0) {
    return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ message: '삭제되었습니다.' })
}
