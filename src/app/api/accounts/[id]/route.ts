import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const { name, code, type, description } = await request.json()

  try {
    const account = await prisma.account.updateMany({
      where: { id, userId: session.user.id },
      data: { name, code, type, description },
    })
    if (account.count === 0) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ message: '업데이트되었습니다.' })
  } catch {
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  try {
    const account = await prisma.account.deleteMany({
      where: { id, userId: session.user.id },
    })
    if (account.count === 0) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ message: '삭제되었습니다.' })
  } catch (error: unknown) {
    // P2003: FK constraint — account is referenced by entries
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2003'
    ) {
      return NextResponse.json(
        { error: '거래 내역이 있는 계정은 삭제할 수 없습니다.' },
        { status: 409 },
      )
    }
    console.error(error)
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
  }
}
