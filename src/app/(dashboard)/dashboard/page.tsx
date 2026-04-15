'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/currencies'

interface DashboardData {
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  netWorth: number
  baseCurrency: string
  recentTransactions: Array<{
    id: string
    date: string
    description: string
    entries: Array<{
      amount: string
      currency: string
      exchangeRate: string
      debitAccount: { name: string; code: string; type: string }
      creditAccount: { name: string; code: string; type: string }
    }>
  }>
  budgetOverview: Array<{
    accountId: string
    name: string
    code: string
    budget: number
    actual: number
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setError(null)
        const res = await fetch('/api/dashboard')
        if (!res.ok) {
          throw new Error(`대시보드 데이터를 불러오지 못했습니다. (${res.status})`)
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : '대시보드 데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    loadDashboardData()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-gray-500 dark:text-gray-400">로딩 중...</div></div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-full"><div className="text-red-500">{error}</div></div>
  }

  if (!data) return null

  const baseCurrency = data.baseCurrency ?? 'KRW'
  const fmt = (amount: number) => formatCurrency(amount, baseCurrency)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">대시보드</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">기준 통화: {baseCurrency}</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">총 자산</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(data.totalAssets)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">총 부채</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{fmt(data.totalLiabilities)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">총 자본</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(data.totalEquity)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">순자산</p>
          <p className={`text-2xl font-bold mt-1 ${data.netWorth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {fmt(data.netWorth)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
          <div className="p-4 border-b dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">최근 거래</h2>
          </div>
          <div className="p-4 space-y-3">
            {data.recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">거래 내역이 없습니다.</p>
            ) : (
              data.recentTransactions.map(tx => {
                const totalAmount = tx.entries.reduce((sum, e) => sum + Number(e.amount) * (Number(e.exchangeRate) || 1), 0)
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(tx.date).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmt(totalAmount)}</p>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Budget Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
          <div className="p-4 border-b dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">이번 달 예산 현황</h2>
          </div>
          <div className="p-4 space-y-4">
            {data.budgetOverview.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">예산이 설정되지 않았습니다.</p>
            ) : (
              data.budgetOverview.map(b => {
                const pct = b.budget > 0 ? Math.min((b.actual / b.budget) * 100, 100) : 0
                const isOver = b.actual > b.budget
                return (
                  <div key={b.accountId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{b.name}</span>
                      <span className={isOver ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}>
                        {fmt(b.actual)} / {fmt(b.budget)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${isOver ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
