import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const defaultAccounts = [
      { code: '1001', name: '현금', type: 'ASSET' as const, description: '현금 및 현금성 자산' },
      { code: '1002', name: '보통예금', type: 'ASSET' as const, description: '은행 보통예금' },
      { code: '1003', name: '적금', type: 'ASSET' as const, description: '은행 적금' },
      { code: '2001', name: '신용카드', type: 'LIABILITY' as const, description: '신용카드 미지급금' },
      { code: '2002', name: '대출금', type: 'LIABILITY' as const, description: '각종 대출금' },
      { code: '3001', name: '자본금', type: 'EQUITY' as const, description: '초기 자본금' },
      { code: '4001', name: '급여', type: 'REVENUE' as const, description: '근로 소득' },
      { code: '4002', name: '부수입', type: 'REVENUE' as const, description: '기타 수입' },
      { code: '5001', name: '식비', type: 'EXPENSE' as const, description: '식료품 및 외식비' },
      { code: '5002', name: '교통비', type: 'EXPENSE' as const, description: '대중교통 및 차량 유지비' },
      { code: '5003', name: '주거비', type: 'EXPENSE' as const, description: '임대료 및 관리비' },
      { code: '5004', name: '의류비', type: 'EXPENSE' as const, description: '의류 및 신발' },
      { code: '5005', name: '의료비', type: 'EXPENSE' as const, description: '병원비 및 약품비' },
      { code: '5006', name: '문화/여가비', type: 'EXPENSE' as const, description: '문화생활 및 여가활동' },
      { code: '5007', name: '통신비', type: 'EXPENSE' as const, description: '휴대폰 및 인터넷 요금' },
      { code: '5008', name: '교육비', type: 'EXPENSE' as const, description: '교육 관련 비용' },
    ]

    // Create user and default accounts atomically
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, password: hashedPassword },
      })
      await tx.account.createMany({
        data: defaultAccounts.map(acc => ({ ...acc, userId: user.id })),
      })
    })

    return NextResponse.json({ message: '회원가입이 완료되었습니다.' }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 400 })
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
