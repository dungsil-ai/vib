import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeCurrencyCode } from '@/lib/api'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { currency: true },
    })

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ currency: user.currency })
  } catch (error) {
    console.error('[settings] GET error:', error)
    return NextResponse.json({ error: '설정을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: { currency?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 })
  }

  const normalizedCurrency = normalizeCurrencyCode(body.currency)
  if (!normalizedCurrency.ok || !normalizedCurrency.value) {
    return normalizedCurrency.ok
      ? NextResponse.json({ error: '통화 코드를 입력해주세요.' }, { status: 400 })
      : normalizedCurrency.response
  }

  const currency = normalizedCurrency.value

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { currency },
    })

    return NextResponse.json({ currency })
  } catch (error) {
    console.error('[settings] PATCH error:', error)
    return NextResponse.json({ error: '설정을 저장하지 못했습니다.' }, { status: 500 })
  }
}
