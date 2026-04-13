import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}))

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

type CredentialsAuthorize = (
  credentials: Record<string, string> | undefined
) => Promise<{ id: string; email: string; name: string } | null>

const credentialsProvider = authOptions.providers.find(
  (
    provider
  ): provider is typeof provider & {
    options: { authorize: CredentialsAuthorize }
  } => {
    const opts = (provider as { options?: { authorize?: unknown } }).options
    return typeof opts?.authorize === 'function'
  }
)

if (!credentialsProvider) {
  throw new Error('Credentials provider with authorize was not found in authOptions.providers')
}

const credentialsAuthorize = credentialsProvider.options.authorize

describe('auth - authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('자격 증명이 없으면 null을 반환한다', async () => {
    const result = await credentialsAuthorize(undefined)
    expect(result).toBeNull()
  })

  it('이메일이 없으면 null을 반환한다', async () => {
    const result = await credentialsAuthorize({ password: 'test123' } as Record<string, string>)
    expect(result).toBeNull()
  })

  it('비밀번호가 없으면 null을 반환한다', async () => {
    const result = await credentialsAuthorize({ email: 'test@example.com' } as Record<string, string>)
    expect(result).toBeNull()
  })

  it('사용자를 찾을 수 없으면 null을 반환한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const result = await credentialsAuthorize({
      email: 'unknown@example.com',
      password: 'test123',
    })
    expect(result).toBeNull()
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'unknown@example.com' },
    })
  })

  it('비밀번호가 틀리면 null을 반환한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const result = await credentialsAuthorize({
      email: 'test@example.com',
      password: 'wrong_password',
    })
    expect(result).toBeNull()
  })

  it('유효한 자격 증명이면 사용자 정보를 반환한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: '테스트',
      password: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const result = await credentialsAuthorize({
      email: 'test@example.com',
      password: 'correct_password',
    })
    expect(result).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: '테스트',
    })
  })

  it('이메일을 소문자로 정규화한다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await credentialsAuthorize({
      email: '  Test@Example.COM  ',
      password: 'test123',
    })

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })
})

describe('auth - callbacks', () => {
  it('jwt 콜백에서 user가 있으면 token에 id를 설정한다', async () => {
    const jwt = authOptions.callbacks!.jwt!
    const result = await jwt({
      token: { sub: '' },
      user: { id: 'user-1', email: 'test@example.com', name: '테스트' },
      account: null,
      trigger: 'signIn',
    } as Parameters<typeof jwt>[0])
    expect(result.id).toBe('user-1')
  })

  it('jwt 콜백에서 user가 없으면 token을 그대로 반환한다', async () => {
    const jwt = authOptions.callbacks!.jwt!
    const result = await jwt({
      token: { sub: '', id: 'existing-id' },
      trigger: 'update',
    } as Parameters<typeof jwt>[0])
    expect(result.id).toBe('existing-id')
  })

  it('session 콜백에서 token id를 session.user.id에 설정한다', async () => {
    const session = authOptions.callbacks!.session!
    const result = await session({
      session: { user: { name: '테스트', email: 'test@example.com' }, expires: '' },
      token: { id: 'user-1', sub: '' },
    } as Parameters<typeof session>[0])
    expect((result.user as { id: string }).id).toBe('user-1')
  })
})

describe('auth - configuration', () => {
  it('JWT 세션 전략을 사용한다', () => {
    expect(authOptions.session?.strategy).toBe('jwt')
  })

  it('로그인 페이지를 /auth/login으로 설정한다', () => {
    expect(authOptions.pages?.signIn).toBe('/auth/login')
  })
})
