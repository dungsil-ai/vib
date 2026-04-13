'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Icon } from '@iconify/react'
import { useTheme } from './ThemeProvider'

interface SidebarProps {
  user: {
    name?: string | null
    email?: string | null
  }
}

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: 'lucide:layout-dashboard' },
  { href: '/accounts', label: '계정 관리', icon: 'lucide:book-open' },
  { href: '/transactions', label: '거래 내역', icon: 'lucide:credit-card' },
  { href: '/budget', label: '예산 관리', icon: 'lucide:piggy-bank' },
  { href: '/settings', label: '설정', icon: 'lucide:settings' },
]

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg flex flex-col">
      <div className="p-6 border-b dark:border-gray-700">
        <h1 className="flex items-center gap-2 text-xl font-bold text-blue-600">
          <Icon icon="lucide:briefcase" aria-hidden="true" />
          가계부
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">복식부기 방식</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              pathname === item.href || pathname.startsWith(item.href + '/')
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            }`}
          >
            <Icon icon={item.icon} className="text-base shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t dark:border-gray-700">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
        </div>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg mb-1"
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-pressed={theme === 'dark'}
        >
          <Icon
            icon={theme === 'dark' ? 'lucide:sun' : 'lucide:moon'}
            className="text-base shrink-0"
            aria-hidden="true"
          />
          {theme === 'dark' ? '라이트 모드' : '다크 모드'}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
        >
          <Icon icon="lucide:log-out" className="text-base shrink-0" aria-hidden="true" />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
