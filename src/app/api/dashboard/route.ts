import { NextResponse } from 'next/server'
import { serializeData } from '@/lib/serialize'
import { getDashboardData } from '@/lib/dashboard'

export async function GET() {
  try {
    const data = await getDashboardData()
    return NextResponse.json(serializeData(data))
  } catch (error) {
    if (error instanceof Error && error.message === '인증이 필요합니다.') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    console.error('[dashboard] GET error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
