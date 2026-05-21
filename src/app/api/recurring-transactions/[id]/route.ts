import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import {
  buildRecurringTransactionData,
  calculateNextRunAtAfterProgress,
  isRecord,
  RECURRING_TRANSACTION_INCLUDE,
  unwrapRecurringValidation,
  validateRecurringTransactionInput,
} from '../shared'

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문을 입력해주세요.' }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: '요청 본문은 객체여야 합니다.' }, { status: 400 })
  }

  const updatesActiveOnly = Object.keys(body).every(key => key === 'isActive')

  if (updatesActiveOnly) {
    const { isActive } = body
    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive 값이 필요합니다.' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async tx => {
      const updateResult = await tx.recurringTransaction.updateMany({
        where: { id, userId: session.user.id },
        data: { isActive },
      })
      if (updateResult.count === 0) {
        return null
      }

      return tx.recurringTransaction.findFirst({
        where: { id, userId: session.user.id },
        include: RECURRING_TRANSACTION_INCLUDE,
      })
    })

    if (!updated) {
      return NextResponse.json({ error: '반복 거래를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json(serializeData(updated))
  }

  if ('isActive' in body && typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive 값은 boolean이어야 합니다.' }, { status: 400 })
  }

  const validation = unwrapRecurringValidation(await validateRecurringTransactionInput(body, session.user.id))
  if (validation instanceof NextResponse) {
    return validation
  }

  const transactionData = buildRecurringTransactionData({
    ...validation,
    nextRunAt: calculateNextRunAtAfterProgress(validation, existing.nextRunAt),
  })
  const updated = await prisma.$transaction(async tx => {
    const updateResult = await tx.recurringTransaction.updateMany({
      where: { id, userId: session.user.id },
      data: {
        description: transactionData.description,
        frequency: transactionData.frequency,
        dayOfMonth: transactionData.dayOfMonth,
        monthOfYear: transactionData.monthOfYear,
        startDate: transactionData.startDate,
        endDate: transactionData.endDate,
        nextRunAt: transactionData.nextRunAt,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : existing.isActive,
      },
    })
    if (updateResult.count === 0) {
      return null
    }

    await tx.recurringEntry.deleteMany({
      where: { recurringTransactionId: id },
    })
    await tx.recurringEntry.createMany({
      data: transactionData.entries.create.map(entry => ({
        ...entry,
        recurringTransactionId: id,
      })),
    })

    return tx.recurringTransaction.findFirst({
      where: { id, userId: session.user.id },
      include: RECURRING_TRANSACTION_INCLUDE,
    })
  })

  if (!updated) {
    return NextResponse.json({ error: '반복 거래를 찾을 수 없습니다.' }, { status: 404 })
  }

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
