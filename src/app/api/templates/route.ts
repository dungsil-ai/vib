import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { normalizeCurrencyInput, parseExchangeRateInput } from '@/app/api/transactions/shared'

interface TemplateEntryInput {
  debitAccountId: string
  creditAccountId: string
  amount: string | number
  currency?: string
  exchangeRate?: string
  description?: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const templates = await prisma.transactionTemplate.findMany({
    where: { userId: session.user.id },
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

  const normalizedEntries: TemplateEntryInput[] = []
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
    const entryCurrency = entry.currency ?? baseCurrency
    if (entryCurrency !== baseCurrency && (entry.exchangeRate === undefined || entry.exchangeRate === null)) {
      return NextResponse.json({ error: `외화(${entryCurrency}) 분개에는 환율(exchangeRate)이 필요합니다.` }, { status: 400 })
    }
  }

  try {
    const template = await prisma.transactionTemplate.create({
      data: {
        userId: session.user.id,
        description,
        entries: {
          create: normalizedEntries.map(entry => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: String(entry.amount),
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
    return NextResponse.json(serializeData(template), { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '템플릿 생성에 실패했습니다.' }, { status: 400 })
  }
}
