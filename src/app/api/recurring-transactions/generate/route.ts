import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { computeNextRunAt } from '@/lib/recurring'

export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const now = new Date()

  // Find all active recurring transactions due for this user
  const due = await prisma.recurringTransaction.findMany({
    where: {
      userId: session.user.id,
      isActive: true,
      nextRunAt: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: {
      entries: true,
    },
  })

  if (due.length === 0) {
    return NextResponse.json({ generated: 0, transactions: [] })
  }

  const created = []

  for (const recurring of due) {
    const nextRunAt = computeNextRunAt(
      recurring.frequency,
      recurring.dayOfMonth,
      recurring.monthOfYear,
      recurring.nextRunAt,
    )

    const transaction = await prisma.$transaction(async tx => {
      // nextRunAt 일치 조건으로 낙관적 동시성 제어 - 중복 생성 방지
      const updateResult = await tx.recurringTransaction.updateMany({
        where: {
          id: recurring.id,
          userId: session.user.id,
          isActive: true,
          nextRunAt: recurring.nextRunAt,
        },
        data: {
          lastRunAt: recurring.nextRunAt,
          nextRunAt,
          ...(recurring.endDate && nextRunAt > recurring.endDate ? { isActive: false } : {}),
        },
      })

      if (updateResult.count === 0) {
        return null
      }

      return tx.transaction.create({
        data: {
          userId: session.user.id,
          date: recurring.nextRunAt,
          description: recurring.description,
          entries: {
            create: recurring.entries.map(entry => ({
              debitAccountId: entry.debitAccountId,
              creditAccountId: entry.creditAccountId,
              amount: entry.amount,
              description: entry.description,
            })),
          },
        },
        include: {
          entries: {
            include: {
              debitAccount: { select: { name: true, code: true } },
              creditAccount: { select: { name: true, code: true } },
            },
          },
        },
      })
    })

    if (transaction) {
      created.push(transaction)
    }
  }

  return NextResponse.json({ generated: created.length, transactions: serializeData(created) })
}
