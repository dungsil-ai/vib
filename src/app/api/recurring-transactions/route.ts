import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import {
  buildRecurringTransactionData,
  RECURRING_TRANSACTION_INCLUDE,
  unwrapRecurringValidation,
  validateRecurringTransactionInput,
} from './shared'

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: RECURRING_TRANSACTION_INCLUDE,
  })

  return NextResponse.json(serializeData(recurringTransactions))
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문을 입력해주세요.' }, { status: 400 })
  }
  const validation = unwrapRecurringValidation(await validateRecurringTransactionInput(body, session.user.id))
  if (validation instanceof NextResponse) {
    return validation
  }

  try {
    const recurring = await prisma.recurringTransaction.create({
      data: {
        userId: session.user.id,
        ...buildRecurringTransactionData(validation),
      },
      include: RECURRING_TRANSACTION_INCLUDE,
    })
    return NextResponse.json(serializeData(recurring), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '반복 거래 생성에 실패했습니다.' }, { status: 400 })
  }
}
