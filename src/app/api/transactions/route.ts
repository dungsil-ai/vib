import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { apiError, parseStrictInteger, parseStrictNumber, withAuth } from '@/lib/api'
import { TRANSACTION_ENTRY_INCLUDE, validateTransactionPayload } from './shared'

export const GET = withAuth(async (request: NextRequest, userId: string) => {
  const { searchParams } = new URL(request.url)

  // 예산 페이지에서 사용하는 year/month 파라미터
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  // 목록 필터 파라미터
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

  // 키워드 길이 검증
  if (keywordParam !== null && keywordParam.length > 100) {
    return apiError('키워드는 100자 이하로 입력해주세요.')
  }

  // year/month는 공백을 제외하고 함께 입력되어야 합니다.
  const hasYearParam = Boolean(yearParam?.trim())
  const hasMonthParam = Boolean(monthParam?.trim())
  if ((hasYearParam && !hasMonthParam) || (!hasYearParam && hasMonthParam)) {
    return apiError('year와 month를 함께 입력해주세요.')
  }

  // 날짜 필터 구성
  let dateWhere: { gte?: Date; lte?: Date } | undefined

  if (hasYearParam && hasMonthParam) {
    const parsedYear = parseStrictInteger(yearParam, 'year')
    const parsedMonth = parseStrictInteger(monthParam, 'month')
    if (!parsedYear.ok || !parsedMonth.ok || parsedMonth.value < 1 || parsedMonth.value > 12) {
      return apiError('유효한 year/month를 입력해주세요.')
    }
    const y = parsedYear.value
    const m = parsedMonth.value
    dateWhere = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59, 999),
    }
  } else if (startDateParam || endDateParam) {
    dateWhere = {}
    if (startDateParam) {
      const parts = startDateParam.split('-').map(Number)
      if (parts.length !== 3 || parts.some(isNaN)) {
        return apiError('유효한 startDate를 입력해주세요.')
      }
      const [sy, sm, sd] = parts
      const d = new Date(sy, sm - 1, sd)
      if (isNaN(d.getTime()) || d.getFullYear() !== sy || d.getMonth() !== sm - 1 || d.getDate() !== sd) {
        return apiError('유효한 startDate를 입력해주세요.')
      }
      dateWhere.gte = d
    }
    if (endDateParam) {
      const parts = endDateParam.split('-').map(Number)
      if (parts.length !== 3 || parts.some(isNaN)) {
        return apiError('유효한 endDate를 입력해주세요.')
      }
      const [ey, em, ed] = parts
      const d = new Date(ey, em - 1, ed, 23, 59, 59, 999)
      if (isNaN(d.getTime()) || d.getFullYear() !== ey || d.getMonth() !== em - 1 || d.getDate() !== ed) {
        return apiError('유효한 endDate를 입력해주세요.')
      }
      dateWhere.lte = d
    }
  }

  // 최소/최대 금액 검증
  let minAmount: number | undefined
  if (minAmountParam !== null) {
    const parsedMinAmount = parseStrictNumber(minAmountParam, 'minAmount')
    if (!parsedMinAmount.ok) {
      return apiError('유효한 minAmount 값이 필요합니다.')
    }
    minAmount = parsedMinAmount.value
  }
  let maxAmount: number | undefined
  if (maxAmountParam !== null) {
    const parsedMaxAmount = parseStrictNumber(maxAmountParam, 'maxAmount')
    if (!parsedMaxAmount.ok) {
      return apiError('유효한 maxAmount 값이 필요합니다.')
    }
    maxAmount = parsedMaxAmount.value
    if (minAmount !== undefined && minAmount > maxAmount) {
      return apiError('minAmount는 maxAmount보다 클 수 없습니다.')
    }
  }

  // 정렬
  const sortBy = sortByParam === 'createdAt' ? 'createdAt' : 'date'
  const sortOrder: 'asc' | 'desc' = sortOrderParam === 'asc' ? 'asc' : 'desc'
  const orderBy = sortBy === 'createdAt'
    ? { createdAt: sortOrder }
    : { date: sortOrder }

  // 계정 조건과 금액 조건이 같은 거래의 서로 다른 분개에 매칭될 수 있도록 분리합니다.
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

  // 조회 조건 구성
  const where = {
    userId,
    ...(dateWhere ? { date: dateWhere } : {}),
    ...(keywordParam ? { description: { contains: keywordParam, mode: 'insensitive' as const } } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  }

  // 페이지네이션 응답
  const DEFAULT_PAGE_SIZE = 20
  const MAX_PAGE_SIZE = 100
  let page = 1
  let pageSize = DEFAULT_PAGE_SIZE

  if (pageParam !== null) {
    const parsedPage = parseStrictInteger(pageParam, 'page')
    if (!parsedPage.ok || parsedPage.value < 1) {
      return apiError('유효한 page 값이 필요합니다.')
    }
    page = parsedPage.value
  }
  if (pageSizeParam !== null) {
    const parsedPageSize = parseStrictInteger(pageSizeParam, 'pageSize')
    if (!parsedPageSize.ok || parsedPageSize.value < 1) {
      return apiError('유효한 pageSize 값이 필요합니다.')
    }
    pageSize = Math.min(parsedPageSize.value, MAX_PAGE_SIZE)
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
})

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const validatedPayload = await validateTransactionPayload(userId, await request.json())
  if (!validatedPayload.ok) {
    return validatedPayload.response
  }

  const { parsedDate, description, normalizedEntries, baseCurrency } = validatedPayload.value

  try {
    const transaction = await prisma.transaction.create({
      data: {
        userId,
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
})
