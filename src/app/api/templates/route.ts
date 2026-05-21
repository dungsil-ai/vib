import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { AccountOwnershipError, assertAccountsOwned } from '@/lib/accounting'

interface TemplateEntryInput {
  debitAccountId: string
  creditAccountId: string
  amount: string | number
  description?: string
}

const LIST_INCLUDE = {
  entries: {
    include: {
      debitAccount: { select: { name: true, code: true, type: true } },
      creditAccount: { select: { name: true, code: true, type: true } },
    },
  },
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('pageSize')
  const usesPagination = pageParam !== null || pageSizeParam !== null

  if (usesPagination) {
    const page = pageParam ? Number(pageParam) : 1
    const pageSize = pageSizeParam ? Number(pageSizeParam) : 20

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ error: '유효한 page 값을 입력해주세요.' }, { status: 400 })
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return NextResponse.json({ error: 'pageSize는 1 이상 100 이하로 입력해주세요.' }, { status: 400 })
    }

    const where = { userId: session.user.id }
    const [total, data] = await prisma.$transaction([
      prisma.transactionTemplate.count({ where }),
      prisma.transactionTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: LIST_INCLUDE,
      }),
    ])

    return NextResponse.json({ data: serializeData(data), total, page, pageSize })
  }

  const templates = await prisma.transactionTemplate.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: LIST_INCLUDE,
  })

  return NextResponse.json(serializeData(templates))
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { description, entries } = await request.json()

  if (!description || !entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 })
    }
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: '유효한 거래 금액을 입력해주세요.' }, { status: 400 })
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return NextResponse.json({ error: '차변 계정과 대변 계정은 달라야 합니다.' }, { status: 400 })
    }
  }

  const accountIds = [
    ...new Set([
      ...entries.map((e: TemplateEntryInput) => e.debitAccountId),
      ...entries.map((e: TemplateEntryInput) => e.creditAccountId),
    ]),
  ]
  try {
    await assertAccountsOwned(session.user.id, accountIds)
  } catch (error) {
    if (error instanceof AccountOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  try {
    const template = await prisma.transactionTemplate.create({
      data: {
        userId: session.user.id,
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
}
