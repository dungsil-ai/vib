import { Suspense } from 'react'
import { formatCurrency } from '@/lib/currencies'
import { getDashboardData } from '@/lib/dashboard'
import BudgetProgressBar from './BudgetProgressBar.client'

function SectionFallback({ title }: { title: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-gray-400 dark:text-gray-500">로딩 중...</p>
    </div>
  )
}

async function BaseCurrencyLabel({ dataPromise }: { dataPromise: ReturnType<typeof getDashboardData> }) {
  const data = await dataPromise
  return <span className="text-sm text-gray-500 dark:text-gray-400">기준 통화: {data.baseCurrency}</span>
}

async function SummaryCards({ dataPromise }: { dataPromise: ReturnType<typeof getDashboardData> }) {
  const data = await dataPromise
  const fmt = (amount: number) => formatCurrency(amount, data.baseCurrency)

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700"><p className="text-sm text-gray-500 dark:text-gray-400">총 자산</p><p className="text-2xl font-bold text-blue-600 mt-1">{fmt(data.totalAssets)}</p></div>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700"><p className="text-sm text-gray-500 dark:text-gray-400">총 부채</p><p className="text-2xl font-bold text-red-500 mt-1">{fmt(data.totalLiabilities)}</p></div>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700"><p className="text-sm text-gray-500 dark:text-gray-400">총 자본</p><p className="text-2xl font-bold text-green-600 mt-1">{fmt(data.totalEquity)}</p></div>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700"><p className="text-sm text-gray-500 dark:text-gray-400">순자산</p><p className={`text-2xl font-bold mt-1 ${data.netWorth >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(data.netWorth)}</p></div>
    </div>
  )
}

async function DashboardDetails({ dataPromise }: { dataPromise: ReturnType<typeof getDashboardData> }) {
  const data = await dataPromise
  const fmt = (amount: number) => formatCurrency(amount, data.baseCurrency)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700"><h2 className="font-semibold text-gray-900 dark:text-gray-100">최근 거래</h2></div>
        <div className="p-4 space-y-3">
          {data.recentTransactions.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">거래 내역이 없습니다.</p> : data.recentTransactions.map(tx => {
            const totalAmount = tx.entries.reduce((sum, e) => sum + e.amount * (e.exchangeRate || 1), 0)
            return <div key={tx.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0"><div><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.description}</p><p className="text-xs text-gray-500 dark:text-gray-400">{new Date(tx.date).toLocaleDateString('ko-KR')}</p></div><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmt(totalAmount)}</p></div>
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700"><h2 className="font-semibold text-gray-900 dark:text-gray-100">이번 달 예산 현황</h2></div>
        <div className="p-4 space-y-4">
          {data.budgetOverview.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">예산이 설정되지 않았습니다.</p> : data.budgetOverview.map(b => {
            const pct = b.budget > 0 ? (b.actual / b.budget) * 100 : 0
            const isOver = b.actual > b.budget
            return <div key={b.accountId}><div className="flex justify-between text-sm mb-1"><span className="font-medium text-gray-700 dark:text-gray-300">{b.name}</span><span className={isOver ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}>{fmt(b.actual)} / {fmt(b.budget)}</span></div><BudgetProgressBar percent={pct} overBudget={isOver} /></div>
          })}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const dataPromise = getDashboardData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">대시보드</h1>
        <Suspense fallback={<span className="text-sm text-gray-400 dark:text-gray-500">기준 통화: ...</span>}>
          <BaseCurrencyLabel dataPromise={dataPromise} />
        </Suspense>
      </div>

      <Suspense fallback={<SectionFallback title="요약 지표" />}>
        <SummaryCards dataPromise={dataPromise} />
      </Suspense>

      <Suspense fallback={<SectionFallback title="상세 현황" />}>
        <DashboardDetails dataPromise={dataPromise} />
      </Suspense>
    </div>
  )
}
