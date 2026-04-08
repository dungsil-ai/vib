'use client'

import { useEffect, useState } from 'react'

interface Account {
  id: string
  code: string
  name: string
  type: string
  balance: number
}

interface Budget {
  id: string
  accountId: string
  year: number
  month: number
  amount: string
  account: { name: string; code: string; type: string }
}

interface BudgetRow {
  account: Account
  budget: Budget | null
  editAmount: string
  editing: boolean
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

async function loadBudgetData(year: number, month: number) {
  const [accRes, budRes] = await Promise.all([
    fetch('/api/accounts'),
    fetch(`/api/budget?year=${year}&month=${month}`),
  ])
  if (!accRes.ok) throw new Error(`계정 목록을 불러오지 못했습니다. (${accRes.status})`)
  if (!budRes.ok) throw new Error(`예산 데이터를 불러오지 못했습니다. (${budRes.status})`)
  const accs: Account[] = await accRes.json()
  const buds: Budget[] = await budRes.json()

  const expenseAccounts = accs.filter(a => a.type === 'EXPENSE')
  const budgetMap = new Map(buds.map(b => [b.accountId, b]))

  const txRes = await fetch(`/api/transactions?year=${year}&month=${month}`)
  if (!txRes.ok) throw new Error(`거래 데이터를 불러오지 못했습니다. (${txRes.status})`)
  const transactions = await txRes.json()

  const actuals: Record<string, number> = {}
  for (const tx of transactions) {
    for (const entry of tx.entries) {
      if (entry.debitAccount.type === 'EXPENSE') {
        actuals[entry.debitAccountId] = (actuals[entry.debitAccountId] || 0) + Number(entry.amount)
      }
    }
  }

  const rows = expenseAccounts.map(acc => ({
    account: acc,
    budget: budgetMap.get(acc.id) || null,
    editAmount: budgetMap.get(acc.id)?.amount || '',
    editing: false,
  }))

  return { rows, actuals }
}

export default function BudgetPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualExpenses, setActualExpenses] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { rows: newRows, actuals } = await loadBudgetData(year, month)
        if (!cancelled) {
          setRows(newRows)
          setActualExpenses(actuals)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [year, month])

  const startEditing = (index: number) => {
    const updated = [...rows]
    updated[index].editing = true
    setRows(updated)
  }

  const saveBudget = async (index: number) => {
    const row = rows[index]
    const amount = parseFloat(row.editAmount)
    if (isNaN(amount) || amount < 0) return

    const body = {
      accountId: row.account.id,
      year,
      month,
      amount,
    }

    const res = await fetch('/api/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const { rows: newRows, actuals } = await loadBudgetData(year, month)
      setRows(newRows)
      setActualExpenses(actuals)
    }
  }

  const updateEditAmount = (index: number, value: string) => {
    const updated = [...rows]
    updated[index].editAmount = value
    setRows(updated)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-gray-500">로딩 중...</div></div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-full"><div className="text-red-500">{error}</div></div>
  }

  const totalBudget = rows.reduce((sum, r) => sum + Number(r.budget?.amount || 0), 0)
  const totalActual = rows.reduce((sum, r) => sum + (actualExpenses[r.account.id] || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">예산 관리</h1>
        <div className="flex gap-2 items-center">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">총 예산</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">실제 지출</p>
          <p className="text-xl font-bold text-orange-500 mt-1">{formatCurrency(totalActual)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">남은 예산</p>
          <p className={`text-xl font-bold mt-1 ${totalBudget - totalActual >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatCurrency(totalBudget - totalActual)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">비용 계정별 예산</h2>
          <p className="text-xs text-gray-500 mt-1">예산 금액을 클릭하여 편집하세요</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-gray-500">비용 계정이 없습니다.</div>
        ) : (
          <div className="divide-y">
            {rows.map((row, index) => {
              const actual = actualExpenses[row.account.id] || 0
              const budget = Number(row.budget?.amount || 0)
              const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0
              const isOver = actual > budget && budget > 0

              return (
                <div key={row.account.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-900">{row.account.name}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">{row.account.code}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm ${isOver ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                        실제: {formatCurrency(actual)}
                      </span>
                      {row.editing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={row.editAmount}
                            onChange={e => updateEditAmount(index, e.target.value)}
                            className="w-28 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="예산 금액"
                            autoFocus
                          />
                          <button
                            onClick={() => saveBudget(index)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => {
                              const updated = [...rows]
                              updated[index].editing = false
                              setRows(updated)
                            }}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(index)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 min-w-[120px] text-right"
                        >
                          예산: {budget > 0 ? formatCurrency(budget) : '설정 없음'}
                        </button>
                      )}
                    </div>
                  </div>
                  {budget > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{pct.toFixed(1)}% 사용</span>
                        <span>남은 예산: {formatCurrency(Math.max(0, budget - actual))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
