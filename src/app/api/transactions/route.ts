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

  // Validate keyword length
  if (keywordParam !== null && keywordParam.length > 100) {
    return NextResponse.json({ error: '키워드는 100자 이하로 입력해주세요.' }, { status: 400 })
  }

  if (searchParams.has('year') || searchParams.has('month')) {
    return NextResponse.json({ error: 'year/month 파라미터는 더 이상 지원하지 않습니다. startDate/endDate를 사용해주세요.' }, { status: 400 })
  }

  // Build date filter
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

  // Validate minAmount / maxAmount
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

  // Sort
  const sortBy = sortByParam === 'createdAt' ? 'createdAt' : 'date'
  const sortOrder: 'asc' | 'desc' = sortOrderParam === 'asc' ? 'asc' : 'desc'
  const orderBy = sortBy === 'createdAt'
    ? { createdAt: sortOrder }
    : { date: sortOrder }

  // Build entries filters separately so account and amount conditions
  // can match different entries within the same transaction.
  const accountEntriesWhere = accountIdParam
    ? {
        entries: {
          some: {
            OR: [
              { debitAccountId: accountIdParam },
              { creditAccountId: accountIdParam },
            ],
          },
        },
      }
    : undefined

  const amountSome: { gte?: number; lte?: number } = {}
  if (minAmount !== undefined) amountSome.gte = minAmount
  if (maxAmount !== undefined) amountSome.lte = maxAmount
  const amountEntriesWhere = Object.keys(amountSome).length > 0
    ? { entries: { some: { amount: amountSome } } }
    : undefined

  const andConditions = [accountEntriesWhere, amountEntriesWhere].filter(
    (condition): condition is NonNullable<typeof condition> => condition !== undefined,
  )

  // Build where clause
  const where = {
    userId: session.user.id,
    ...(dateWhere ? { date: dateWhere } : {}),
    ...(keywordParam ? { description: { contains: keywordParam, mode: 'insensitive' as const } } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  }

  // ── Paginated mode ──
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
