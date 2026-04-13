import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { CURRENCY_CODES } from '@/lib/currencies'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  // Validate and parse limit
  const DEFAULT_LIMIT = 50
  const MAX_LIMIT = 100
  const limitParam = searchParams.get('limit')
  let limit = DEFAULT_LIMIT
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: '유효한 limit 값이 필요합니다.' }, { status: 400 })
    }
    limit = Math.min(parsed, MAX_LIMIT)
  }

  // When year/month are supplied, validate and filter by date range;
  // return all matching rows (no limit) so budget page gets accurate monthly totals.
  if ((yearParam && !monthParam) || (!yearParam && monthParam)) {
    return NextResponse.json({ error: 'year와 month를 함께 입력해주세요.' }, { status: 400 })
  }
  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (yearParam && monthParam) {
    const y = parseInt(yearParam, 10)
    const m = parseInt(monthParam, 10)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: '유효한 year/month를 입력해주세요.' }, { status: 400 })
    }
    dateFilter = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59, 999),
    }
  }

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: session.user.id,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      orderBy: { date: 'desc' },
      ...(dateFilter ? {} : { take: limit }),
      include: {
        entries: {
          include: {
            debitAccount: { select: { name: true, code: true, type: true } },
            creditAccount: { select: { name: true, code: true, type: true } },
          },      },
      },
    })

    return NextResponse.json(serializeData(transactions))
  } catch (error) {
    console.error('[transactions] GET error:', error)
    return NextResponse.json({ error: '거래 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

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
    if (entry.currency && !CURRENCY_CODES.includes(entry.currency)) {
      return NextResponse.json({ error: '지원하지 않는 통화 코드입니다.' }, { status: 400 })
    }
    // Validate exchangeRate if provided
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
  const ownedAccounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId: session.user.id },
    select: { id: true },
  })
  if (ownedAccounts.length !== accountIds.length) {
    return NextResponse.json({ error: '잘못된 계정이 포함되어 있습니다.' }, { status: 403 })
  }

  try {
    // Get user's base currency for default exchange rate
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { currency: true },
    })
    const baseCurrency = user?.currency ?? 'KRW'

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

