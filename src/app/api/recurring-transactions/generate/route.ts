import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { computeNextRunAt } from '@/lib/recurring'

const GENERATION_BATCH_SIZE = 10

export async function POST(request?: NextRequest) {
  void request
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const now = new Date()

  // 현재 사용자에게 실행 기한이 도래한 활성 반복 거래를 조회
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

  const generateTransaction = async (recurring: (typeof due)[number]) => {
    const nextRunAt = computeNextRunAt(
      recurring.frequency,
      recurring.dayOfMonth,
      recurring.monthOfYear,
      recurring.nextRunAt,
    )

    return prisma.$transaction(async tx => {
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
              currency: entry.currency,
              exchangeRate: entry.exchangeRate,
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
  }

  const transactions: Array<Awaited<ReturnType<typeof generateTransaction>>> = []
  const failures: Array<{ recurringTransactionId: string, error: string }> = []

  for (let index = 0; index < due.length; index += GENERATION_BATCH_SIZE) {
    const batch = due.slice(index, index + GENERATION_BATCH_SIZE)
    const settled = await Promise.allSettled(batch.map(generateTransaction))

    settled.forEach((result, batchIndex) => {
      if (result.status === 'fulfilled') {
        transactions.push(result.value)
        return
      }

      failures.push({
        recurringTransactionId: batch[batchIndex].id,
        error: result.reason instanceof Error ? result.reason.message : '반복 거래 생성 중 오류가 발생했습니다.',
      })
    })
  }

  const created = transactions.filter((transaction): transaction is NonNullable<typeof transaction> => transaction !== null)

  return NextResponse.json({
    generated: created.length,
    transactions: serializeData(created),
    ...(failures.length > 0 ? { failures } : {}),
  })
}
