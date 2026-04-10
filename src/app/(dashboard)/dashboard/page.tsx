'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency'

interface CurrencyTotals {
  currency: SupportedCurrency
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  netWorth: number
}

interface DashboardData {
  totals: CurrencyTotals[]
  recentTransactions: Array<{
    id: string
    date: string
    description: string
    entries: Array<{
      amount: string
      debitAccount: { name: string; code: string; type: string; currency: SupportedCurrency }
      creditAccount: { name: string; code: string; type: string; currency: SupportedCurrency }
    }>
  }>
  budgetOverview: Array<{
    currency: SupportedCurrency
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
  const budgetByCurrency = useMemo(() => {
    if (!data) return []
    const map = new Map<SupportedCurrency, DashboardData['budgetOverview']>()
    for (const item of data.budgetOverview) {
      const list = map.get(item.currency) ?? []
      list.push(item)
      map.set(item.currency, list)
    }
    return Array.from(map.entries())
  }, [data])

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">대시보드</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.totals.map(total => (
          <div key={total.currency} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">통화 {total.currency}</p>
              <span className={`text-sm px-2 py-0.5 rounded-full ${total.netWorth >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                순자산 {formatCurrency(total.netWorth, total.currency)}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>총 자산</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(total.totalAssets, total.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>총 부채</span>
                <span className="font-semibold text-red-500">{formatCurrency(total.totalLiabilities, total.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>총 자본</span>
                <span className="font-semibold text-green-600">{formatCurrency(total.totalEquity, total.currency)}</span>
              </div>
            </div>
          </div>
        ))}
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
                const totalAmount = tx.entries.reduce((sum, e) => sum + Number(e.amount), 0)
                const currency = (tx.entries[0]?.debitAccount.currency || tx.entries[0]?.creditAccount.currency || 'KRW') as SupportedCurrency
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(tx.date).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(totalAmount, currency)}
                    </p>
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
            {budgetByCurrency.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">예산이 설정되지 않았습니다.</p>
            ) : (
              budgetByCurrency.map(([currency, items]) => (
                <div key={currency} className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">통화 {currency}</span>
                  </div>
                  {items.map(b => {
                    const pct = b.budget > 0 ? Math.min((b.actual / b.budget) * 100, 100) : 0
                    const isOver = b.actual > b.budget
                    return (
                      <div key={b.accountId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{b.name}</span>
                          <span className={isOver ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}>
                            {formatCurrency(b.actual, currency)} / {formatCurrency(b.budget, currency)}
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
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
