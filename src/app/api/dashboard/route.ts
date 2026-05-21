import { NextResponse } from 'next/server'
import { AuthenticationError, requireUser } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard'
import { serializeData } from '@/lib/serialize'

export async function GET() {
  try {
    const user = await requireUser({ onUnauthenticated: 'throw' })
    const data = await getDashboardData(user.id)
    return NextResponse.json(serializeData(data))
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[dashboard] GET error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
