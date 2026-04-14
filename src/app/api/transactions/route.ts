import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { CURRENCY_CODES } from '@/lib/currencies'

const ENTRY_INCLUDE = {
  entries: {
    include: {
      debitAccount: { select: { name: true, code: true, type: true } },
      creditAccount: { select: { name: true, code: true, type: true } },
    },
  },
} as const

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // ── Legacy params (year/month) used by budget page ──
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  // ── New filter params ──
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

  // year/month must be supplied together (ignore empty strings)
  const hasYearParam = Boolean(yearParam?.trim())
  const hasMonthParam = Boolean(monthParam?.trim())
  if ((hasYearParam && !hasMonthParam) || (!hasYearParam && hasMonthParam)) {
    return NextResponse.json({ error: 'year와 month를 함께 입력해주세요.' }, { status: 400 })
  }

  // Build date filter
  let dateWhere: { gte?: Date; lte?: Date } | undefined

  if (hasYearParam && hasMonthParam) {
    const y = parseInt(yearParam!, 10)
    const m = parseInt(monthParam!, 10)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: '유효한 year/month를 입력해주세요.' }, { status: 400 })
    }
    dateWhere = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59, 999),
    }
  } else if (startDateParam || endDateParam) {
    dateWhere = {}
    if (startDateParam) {
      const parts = startDateParam.split('-').map(Number)
      if (parts.length !== 3 || parts.some(isNaN)) {
        return NextResponse.json({ error: '유효한 startDate를 입력해주세요.' }, { status: 400 })
      }
      const [sy, sm, sd] = parts
      const d = new Date(sy, sm - 1, sd)
      if (isNaN(d.getTime()) || d.getFullYear() !== sy || d.getMonth() !== sm - 1 || d.getDate() !== sd) {
        return NextResponse.json({ error: '유효한 startDate를 입력해주세요.' }, { status: 400 })
      }
      dateWhere.gte = d
    }
    if (endDateParam) {
      const parts = endDateParam.split('-').map(Number)
      if (parts.length !== 3 || parts.some(isNaN)) {
        return NextResponse.json({ error: '유효한 endDate를 입력해주세요.' }, { status: 400 })
      }
      const [ey, em, ed] = parts
      const d = new Date(ey, em - 1, ed, 23, 59, 59, 999)
      if (isNaN(d.getTime()) || d.getFullYear() !== ey || d.getMonth() !== em - 1 || d.getDate() !== ed) {
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

  // ── Legacy mode: year+month returns flat array for backward compatibility ──
  const hasLegacyYearMonth = Boolean(yearParam?.trim()) && Boolean(monthParam?.trim())
  if (hasLegacyYearMonth) {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy,
      include: ENTRY_INCLUDE,
    })
    return NextResponse.json(serializeData(transactions))
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
      include: ENTRY_INCLUDE,
    }),
  ])

  return NextResponse.json({
    data: serializeData(transactions),
    total,
    page,
    pageSize,
  })

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { date, description, entries } = await request.json()

  if (!date || !description || !entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  // Validate date
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: '유효한 날짜를 입력해주세요.' }, { status: 400 })
  }

  // Per-entry validations
  for (const entry of entries) {
    if (!entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return NextResponse.json({ error: '각 항목의 차변·대변 계정과 금액을 입력해주세요.' }, { status: 400 })
    }
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: '유효한 거래 금액을 입력해주세요.' }, { status: 400 })
    }
    if (amount <= 0) {
      return NextResponse.json({ error: '거래 금액은 0보다 커야 합니다.' }, { status: 400 })
    }
    if (entry.debitAccountId === entry.creditAccountId) {
      return NextResponse.json({ error: '차변 계정과 대변 계정은 달라야 합니다.' }, { status: 400 })
    }
    // Validate entry currency if provided
    if (entry.currency !== undefined && entry.currency !== null) {
      if (typeof entry.currency !== 'string') {
        return NextResponse.json({ error: '통화 코드는 문자열이어야 합니다.' }, { status: 400 })
      }
      const normalizedCurrency = entry.currency.trim().toUpperCase()
      if (!normalizedCurrency || !CURRENCY_CODES.includes(normalizedCurrency)) {
        return NextResponse.json({ error: '지원하지 않는 통화 코드입니다.' }, { status: 400 })
      }
      entry.currency = normalizedCurrency
    }
    // Validate exchangeRate if provided; require it when currency differs from base
    if (entry.exchangeRate !== undefined) {
      const rate = Number(entry.exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json({ error: '유효한 환율을 입력해주세요.' }, { status: 400 })
      }
    }
  }

  // Verify that all referenced accounts belong to the authenticated user
  const accountIds = [
    ...new Set([
      ...entries.map((e: { debitAccountId: string }) => e.debitAccountId),
      ...entries.map((e: { creditAccountId: string }) => e.creditAccountId),
    ]),
  ]
  const [ownedAccounts, userRecord] = await Promise.all([
    prisma.account.findMany({
      where: { id: { in: accountIds }, userId: session.user.id },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { currency: true },
    }),
  ])
  if (ownedAccounts.length !== accountIds.length) {
    return NextResponse.json({ error: '잘못된 계정이 포함되어 있습니다.' }, { status: 403 })
  }

  const baseCurrency = userRecord?.currency ?? 'KRW'

  // Validate currency and exchangeRate for each entry (requires baseCurrency)
  for (const entry of entries) {
    const entryCurrency: string = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return NextResponse.json(
        { error: `외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.` },
        { status: 400 },
      )
    }
  }

  try {

    const transaction = await prisma.transaction.create({
      data: {
        userId: session.user.id,
        date: parsedDate,
        description,
        entries: {
          create: entries.map((entry: {
            debitAccountId: string
            creditAccountId: string
            amount: string
            currency?: string
            exchangeRate?: string
            description?: string
          }) => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
            currency: entry.currency ?? baseCurrency,
            exchangeRate: entry.exchangeRate ?? '1',
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
    return NextResponse.json(serializeData(transaction), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '거래 생성에 실패했습니다.' }, { status: 400 })
  }
}

