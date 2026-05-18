import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { apiData, apiError, parseStrictNumber, withAuth } from '@/lib/api'

interface TemplateEntryInput {
  debitAccountId: string
  creditAccountId: string
  amount: string | number
  description?: string
}

export const GET = withAuth(async (_request: NextRequest, userId: string) => {
  const templates = await prisma.transactionTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      entries: {
        include: {
          debitAccount: { select: { name: true, code: true, type: true } },
          creditAccount: { select: { name: true, code: true, type: true } },
        },
      },
    },
  })

  return apiData(serializeData(templates))
})

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const { description, entries } = await request.json()

  if (!description || !entries || !Array.isArray(entries) || entries.length === 0) {
    return apiError('필수 필드를 입력해주세요.')
  }

  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return apiError('각 항목의 차변·대변 계정과 금액을 입력해주세요.')
    }
    const parsedAmount = parseStrictNumber(entry.amount, '거래 금액')
    if (!parsedAmount.ok || parsedAmount.value <= 0) {
      return apiError('유효한 거래 금액을 입력해주세요.')
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return apiError('차변 계정과 대변 계정은 달라야 합니다.')
    }
  }

  const accountIds = [
    ...new Set([
      ...entries.map((e: TemplateEntryInput) => e.debitAccountId),
      ...entries.map((e: TemplateEntryInput) => e.creditAccountId),
    ]),
  ]
  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  })
  if (ownedAccounts.length !== accountIds.length) {
    return apiError('잘못된 계정이 포함되어 있습니다.', 403)
  }

  try {
    const template = await prisma.transactionTemplate.create({
      data: {
        userId,
        description,
        entries: {
          create: entries.map((entry: TemplateEntryInput) => ({
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
    return NextResponse.json(serializeData(template), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '템플릿 생성에 실패했습니다.' }, { status: 400 })
  }
})
