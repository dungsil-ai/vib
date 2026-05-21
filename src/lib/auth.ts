import { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const normalizedEmail = credentials.email.trim().toLowerCase()

        try {
          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, email: true, name: true, password: true },
          })

          if (!user) {
            return null
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
  },
}

export class AuthenticationError extends Error {
  constructor(message = '인증이 필요합니다.') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

interface RequireUserOptions {
  onUnauthenticated?: 'redirect' | 'throw'
}

export async function requireUser(options: RequireUserOptions = {}) {
  const { onUnauthenticated = 'redirect' } = options
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    if (onUnauthenticated === 'throw') {
      throw new AuthenticationError()
    }
    redirect('/auth/login')
  }

  return session.user
}
