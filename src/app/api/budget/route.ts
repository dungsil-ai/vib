import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeData } from '@/lib/serialize'
import { apiData, apiError, parseStrictInteger, parseStrictNumber, withAuth } from '@/lib/api'

export const GET = withAuth(async (request: NextRequest, userId: string) => {
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') || String(new Date().getFullYear())
  const monthParam = searchParams.get('month') || String(new Date().getMonth() + 1)
  const parsedYear = parseStrictInteger(yearParam, 'year')
  const parsedMonth = parseStrictInteger(monthParam, 'month')

  if (!parsedYear.ok || !parsedMonth.ok || parsedMonth.value < 1 || parsedMonth.value > 12) {
    return apiError('유효한 year/month를 입력해주세요.')
  }

  const year = parsedYear.value
  const month = parsedMonth.value

  try {
    const budgets = await prisma.budget.findMany({
      where: { userId, year, month },
      include: { account: { select: { name: true, code: true, type: true } } },
    })

    return apiData(serializeData(budgets))
  } catch (error) {
    console.error('[budget] GET error:', error)
    return NextResponse.json({ error: '예산 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
})

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const { accountId, year, month, amount } = await request.json()

  if (!accountId || year === undefined || month === undefined || amount === undefined) {
    return apiError('필수 필드를 입력해주세요.')
  }

  const parsedYearResult = parseStrictInteger(year, 'year')
  const parsedMonthResult = parseStrictInteger(month, 'month')
  if (!parsedYearResult.ok || !parsedMonthResult.ok || parsedMonthResult.value < 1 || parsedMonthResult.value > 12) {
    return apiError('유효한 year/month를 입력해주세요.')
  }

  const parsedAmountResult = parseStrictNumber(amount, '금액')
  if (!parsedAmountResult.ok) {
    return apiError('유효한 금액을 입력해주세요.')
  }

  const parsedYear = parsedYearResult.value
  const parsedMonth = parsedMonthResult.value
  const parsedAmount = parsedAmountResult.value

  // 인증된 사용자의 계정인지 확인합니다.
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  })
  if (!account) {
    return apiError('계정을 찾을 수 없습니다.', 404)
  }

  try {
    const budget = await prisma.budget.upsert({
      where: {
        userId_accountId_year_month: {
          userId,
          accountId,
          year: parsedYear,
          month: parsedMonth,
        },
      },
      update: { amount: parsedAmount },
      create: {
        userId,
        accountId,
        year: parsedYear,
        month: parsedMonth,
        amount: parsedAmount,
      },
    })
    return NextResponse.json(serializeData(budget))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '예산 설정에 실패했습니다.' }, { status: 400 })
  }
})

