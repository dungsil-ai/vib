import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { parseUTCDateOnly, parseUTCEndOfDay } from '@/lib/date-range'
import { TRANSACTION_ENTRY_INCLUDE, validateTransactionPayload } from './shared'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // ── Filter params ──
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')
  const accountIdParam = searchParams.get('accountId')
  const keywordParam = searchParams.get('keyword')
  const minAmountParam = searchParams.get('minAmount')
  const maxAmountParam = searchParams.get('maxAmount')
  const sortByParam = searchParams.get('sortBy')
  const sortOrderParam = searchParams.get('sortOrder')
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('pageSize')

  // 키워드 길이를 검증합니다.
  if (keywordParam !== null && keywordParam.length > 100) {
    return NextResponse.json({ error: '키워드는 100자 이하로 입력해주세요.' }, { status: 400 })
  }

  if (searchParams.has('year') || searchParams.has('month')) {
    return NextResponse.json({ error: 'year/month 파라미터는 더 이상 지원하지 않습니다. startDate/endDate를 사용해주세요.' }, { status: 400 })
  }

  // 날짜 필터를 구성합니다.
  let dateWhere: { gte?: Date; lte?: Date } | undefined

  if (startDateParam || endDateParam) {
    dateWhere = {}
    if (startDateParam) {
      const d = parseUTCDateOnly(startDateParam)
      if (!d) {
        return NextResponse.json({ error: '유효한 startDate를 입력해주세요.' }, { status: 400 })
      }
      dateWhere.gte = d
    }
    if (endDateParam) {
      const d = parseUTCEndOfDay(endDateParam)
      if (!d) {
        return NextResponse.json({ error: '유효한 endDate를 입력해주세요.' }, { status: 400 })
      }
      dateWhere.lte = d
    }
  }

  // minAmount/maxAmount를 검증합니다.
  let minAmount: number | undefined
  if (minAmountParam !== null) {
    minAmount = parseFloat(minAmountParam)
    if (!Number.isFinite(minAmount) || minAmount < 0) {
      return NextResponse.json({ error: '유효한 minAmount 값이 필요합니다.' }, { status: 400 })
    }
  }
  let maxAmount: number | undefined
  if (maxAmountParam !== null) {
    maxAmount = parseFloat(maxAmountParam)
    if (!Number.isFinite(maxAmount) || maxAmount < 0) {
      return NextResponse.json({ error: '유효한 maxAmount 값이 필요합니다.' }, { status: 400 })
    }
    if (minAmount !== undefined && minAmount > maxAmount) {
      return NextResponse.json({ error: 'minAmount는 maxAmount보다 클 수 없습니다.' }, { status: 400 })
    }
  }

  // 정렬 조건을 구성합니다.
  const sortBy = sortByParam === 'createdAt' ? 'createdAt' : 'date'
  const sortOrder: 'asc' | 'desc' = sortOrderParam === 'asc' ? 'asc' : 'desc'
  const orderBy = sortBy === 'createdAt'
    ? { createdAt: sortOrder }
    : { date: sortOrder }

  const entrySome: {
    OR?: Array<{ debitAccountId: string } | { creditAccountId: string }>
    amount?: { gte?: number; lte?: number }
  } = {}

  if (accountIdParam) {
    entrySome.OR = [
      { debitAccountId: accountIdParam },
      { creditAccountId: accountIdParam },
    ]
  }
  if (minAmount !== undefined || maxAmount !== undefined) {
    entrySome.amount = {}
    if (minAmount !== undefined) entrySome.amount.gte = minAmount
    if (maxAmount !== undefined) entrySome.amount.lte = maxAmount
  }

  const entriesWhere = Object.keys(entrySome).length > 0
    ? { entries: { some: entrySome } }
    : undefined

  // where 절을 구성합니다.
  const where = {
    userId: session.user.id,
    ...(dateWhere ? { date: dateWhere } : {}),
    ...(keywordParam ? { description: { contains: keywordParam, mode: 'insensitive' as const } } : {}),
    ...(entriesWhere ? entriesWhere : {}),
  }

  // ── 페이지네이션 모드 ──
  const DEFAULT_PAGE_SIZE = 20
  const MAX_PAGE_SIZE = 100
  let page = 1
  let pageSize = DEFAULT_PAGE_SIZE

  if (pageParam !== null) {
    page = parseInt(pageParam, 10)
    if (!Number.isFinite(page) || page < 1) {
      return NextResponse.json({ error: '유효한 page 값이 필요합니다.' }, { status: 400 })
    }
  }
  if (pageSizeParam !== null) {
    pageSize = parseInt(pageSizeParam, 10)
    if (!Number.isFinite(pageSize) || pageSize < 1) {
      return NextResponse.json({ error: '유효한 pageSize 값이 필요합니다.' }, { status: 400 })
    }
    pageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  }

  const skip = (page - 1) * pageSize

  const [total, transactions] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: TRANSACTION_ENTRY_INCLUDE,
    }),
  ])

  return NextResponse.json({
    data: serializeData(transactions),
    total,
    page,
    pageSize,
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const validatedPayload = await validateTransactionPayload(session.user.id, await request.json())
  if (!validatedPayload.ok) {
    return validatedPayload.response
  }

  const { parsedDate, description, normalizedEntries, baseCurrency } = validatedPayload.value

  try {
    const transaction = await prisma.transaction.create({
      data: {
        userId: session.user.id,
        date: parsedDate,
        description,
        entries: {
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
    return NextResponse.json(serializeData(transaction), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '거래 생성에 실패했습니다.' }, { status: 400 })
  }
}
