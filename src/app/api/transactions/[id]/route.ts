import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { CURRENCY_CODES } from '@/lib/currencies'

type TransactionEntryInput = {
  debitAccountId: string
  creditAccountId: string
  amount: string
  currency?: string
  exchangeRate?: string
  description?: string
}

function validateAndNormalizeCurrency(currency: unknown) {
  if (currency === undefined || currency === null) {
    return { ok: true as const }
  }

  if (typeof currency !== 'string') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '통화 코드는 문자열이어야 합니다.' }, { status: 400 }),
    }
  }

  const normalizedCurrency = currency.trim().toUpperCase()
  if (!normalizedCurrency || !CURRENCY_CODES.includes(normalizedCurrency)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '지원하지 않는 통화 코드입니다.' }, { status: 400 }),
    }
  }

  return { ok: true as const, currency: normalizedCurrency }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { date, description, entries } = await request.json()

  if (!date || !description || !entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: '필수 필드를 입력해주세요.' }, { status: 400 })
  }

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: '유효한 날짜를 입력해주세요.' }, { status: 400 })
  }

  const normalizedEntries: TransactionEntryInput[] = []

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
    const normalizedCurrency = validateAndNormalizeCurrency(entry.currency)
    if (!normalizedCurrency.ok) {
      return normalizedCurrency.response
    }
    if (entry.exchangeRate !== undefined) {
      const rate = Number(entry.exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json({ error: '유효한 환율을 입력해주세요.' }, { status: 400 })
      }
    }

    normalizedEntries.push({
      debitAccountId: entry.debitAccountId,
      creditAccountId: entry.creditAccountId,
      amount: entry.amount,
      currency: normalizedCurrency.currency,
      exchangeRate: entry.exchangeRate,
      description: entry.description,
    })
  }

  const accountIds = [
      ...new Set([
      ...normalizedEntries.map(entry => entry.debitAccountId),
      ...normalizedEntries.map(entry => entry.creditAccountId),
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

  for (const entry of normalizedEntries) {
    const entryCurrency: string = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return NextResponse.json(
        { error: `외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.` },
        { status: 400 },
      )
    }
  }

  try {
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        date: parsedDate,
        description,
        entries: {
          deleteMany: {},
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
      include: {
        entries: {
          include: {
            debitAccount: { select: { name: true, code: true, type: true } },
            creditAccount: { select: { name: true, code: true, type: true } },
          },
        },
      },
    })

    return NextResponse.json(serializeData(transaction))
  } catch (error) {
    console.error('Failed to update transaction', { transactionId: id, userId: session.user.id, error })
    return NextResponse.json({ error: '거래 수정에 실패했습니다.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const transaction = await prisma.transaction.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (transaction.count === 0) {
    return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ message: '삭제되었습니다.' })
}
