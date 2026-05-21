import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AccountOwnershipError, assertAccountsOwned } from '@/lib/accounting'
import { serializeData } from '@/lib/serialize'
import { normalizeCurrencyInput, parseExchangeRateInput } from '@/app/api/transactions/shared'
import { computeInitialNextRunAt } from '@/lib/recurring'
import { RECURRING_TRANSACTION_INCLUDE } from './shared'

type RecurringEntryInput = {
  debitAccountId: string
  creditAccountId: string
  amount: string | number
  currency?: string
  exchangeRate?: string
  description?: string
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
      prisma.recurringTransaction.count({ where }),
      prisma.recurringTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: RECURRING_TRANSACTION_INCLUDE,
      }),
    ])

    return NextResponse.json({ data: serializeData(data), total, page, pageSize })
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

  const { description, frequency, dayOfMonth, monthOfYear, startDate, endDate, entries } =
    await request.json()

  if (!description || !frequency || !startDate || !entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
  if (!validFrequencies.includes(frequency)) {
    return NextResponse.json({ error: '유효한 반복 주기를 입력해주세요.' }, { status: 400 })
  }

  const parsedStart = new Date(startDate)
  if (Number.isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: '유효한 시작 날짜를 입력해주세요.' }, { status: 400 })
  }

  if (endDate) {
    const parsedEnd = new Date(endDate)
    if (Number.isNaN(parsedEnd.getTime())) {
      return NextResponse.json({ error: '유효한 종료 날짜를 입력해주세요.' }, { status: 400 })
    }
    if (parsedEnd <= parsedStart) {
      return NextResponse.json({ error: '종료 날짜는 시작 날짜 이후여야 합니다.' }, { status: 400 })
    }
  }

  if (frequency === 'MONTHLY' || frequency === 'YEARLY') {
    const rangeLabel = frequency === 'MONTHLY' ? '월' : '연'
    if (!dayOfMonth || !Number.isFinite(Number(dayOfMonth)) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31) {
      return NextResponse.json({ error: `${rangeLabel} 반복의 경우 1~31 사이의 날짜를 입력해주세요.` }, { status: 400 })
    }
  }

  if (frequency === 'YEARLY') {
    if (!monthOfYear || !Number.isFinite(Number(monthOfYear)) || Number(monthOfYear) < 1 || Number(monthOfYear) > 12) {
      return NextResponse.json({ error: '연 반복의 경우 1~12 사이의 월을 입력해주세요.' }, { status: 400 })
    }
  }

  const normalizedEntries: RecurringEntryInput[] = []
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

    const normalizedCurrency = normalizeCurrencyInput(entry.currency)
    if (!normalizedCurrency.ok) {
      return NextResponse.json({ error: normalizedCurrency.error }, { status: 400 })
    }

    const normalizedExchangeRate = parseExchangeRateInput(entry.exchangeRate)
    if (!normalizedExchangeRate.ok) {
      return NextResponse.json({ error: normalizedExchangeRate.error }, { status: 400 })
    }

    normalizedEntries.push({
      debitAccountId: String(entry.debitAccountId),
      creditAccountId: String(entry.creditAccountId),
      amount: String(entry.amount),
      currency: normalizedCurrency.currency,
      exchangeRate: normalizedExchangeRate.exchangeRate,
      description: typeof entry.description === 'string' ? entry.description : undefined,
    })
  }

  const accountIds = [
    ...new Set([
      ...normalizedEntries.map(e => e.debitAccountId),
      ...normalizedEntries.map(e => e.creditAccountId),
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

  const numericDayOfMonth = dayOfMonth ? Number(dayOfMonth) : null
  const numericMonthOfYear = monthOfYear ? Number(monthOfYear) : null
  const nextRunAt = computeInitialNextRunAt(frequency, numericDayOfMonth, numericMonthOfYear, parsedStart)
  const userRecord = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { currency: true },
  })
  const baseCurrency = userRecord?.currency ?? 'KRW'
  const persistedEntries: RecurringEntryInput[] = []
  for (const entry of normalizedEntries) {
    const entryCurrency = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return NextResponse.json({ error: `외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.` }, { status: 400 })
    }
    persistedEntries.push({
      ...entry,
      currency: entryCurrency,
      exchangeRate: entryCurrency === baseCurrency ? '1' : (entry.exchangeRate ?? '1'),
    })
  }

  try {
    const recurring = await prisma.recurringTransaction.create({
      data: {
        userId: session.user.id,
        description,
        frequency,
        dayOfMonth: numericDayOfMonth,
        monthOfYear: numericMonthOfYear,
        startDate: parsedStart,
        endDate: endDate ? new Date(endDate) : null,
        nextRunAt,
        entries: {
          create: persistedEntries.map(entry => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: String(entry.amount),
            currency: entry.currency,
            exchangeRate: entry.exchangeRate,
            description: entry.description,
          })),
        },
      },
      include: RECURRING_TRANSACTION_INCLUDE,
    })
    return NextResponse.json(serializeData(recurring), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '반복 거래 생성에 실패했습니다.' }, { status: 400 })
  }
}
