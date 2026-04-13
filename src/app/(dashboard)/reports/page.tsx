'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── 타입 정의 ─────────────────────────────────────────────────────────────────

type Tab = 'trial-balance' | 'ledger' | 'income-statement' | 'balance-sheet'

const TABS: { id: Tab; label: string }[] = [
  { id: 'trial-balance', label: '시산표' },
  { id: 'ledger', label: '총계정원장' },
  { id: 'income-statement', label: '손익계산서' },
  { id: 'balance-sheet', label: '재무상태표' },
]

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  EQUITY: '자본',
  REVENUE: '수익',
  EXPENSE: '비용',
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

const BALANCE_TOLERANCE = 0.01

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function currentYear() {
  return new Date().getFullYear()
}

// ─── 시산표 ────────────────────────────────────────────────────────────────────

interface TrialBalanceRow {
  id: string
  code: string
  name: string
  type: string
  debitTotal: number
  creditTotal: number
  balance: number
}

interface TrialBalanceData {
  accounts: TrialBalanceRow[]
  totalDebits: number
  totalCredits: number
}

function TrialBalance() {
  const [data, setData] = useState<TrialBalanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/reports/trial-balance?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '시산표를 불러오지 못했습니다.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : '시산표를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">로딩 중...</div>
      ) : data ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">코드</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">계정명</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">유형</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">차변 합계</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">대변 합계</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">잔액</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {(data.accounts ?? []).map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{row.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{ACCOUNT_TYPE_LABELS[row.type] ?? row.type}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.debitTotal)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.creditTotal)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${row.balance < 0 ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                    {formatCurrency(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-900 dark:text-gray-100">합계</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(data.totalDebits)}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(data.totalCredits)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
          {data.accounts.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">계정이 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── 총계정원장 ────────────────────────────────────────────────────────────────

interface SimpleAccount {
  id: string
  code: string
  name: string
  type: string
  balance: number
}

interface LedgerEntry {
  id: string
  date: string
  transactionDescription: string
  entryDescription: string | null
  debit: number
  credit: number
  balance: number
  counterpart: string
}

interface LedgerData {
  account: { id: string; code: string; name: string; type: string }
  openingBalance: number
  entries: LedgerEntry[]
}

function Ledger() {
  const [accounts, setAccounts] = useState<SimpleAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    fetch('/api/accounts')
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? '계정 목록을 불러오지 못했습니다.')
        return json
      })
      .then((list: SimpleAccount[]) => setAccounts(Array.isArray(list) ? list : []))
      .catch((err) => {
        setAccounts([])
        setError(err instanceof Error ? err.message : '계정 목록을 불러오는 중 오류가 발생했습니다.')
      })
  }, [])

  const load = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ accountId: selectedAccountId })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/reports/ledger?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '총계정원장을 불러오지 못했습니다.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : '총계정원장을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId, startDate, endDate])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">계정 선택</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">계정을 선택하세요</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!selectedAccountId ? (
        <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">계정을 선택하면 원장이 표시됩니다.</div>
      ) : loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">로딩 중...</div>
      ) : data ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-x-auto">
          <div className="px-4 py-3 border-b dark:border-gray-700">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              [{data.account.code}] {data.account.name}
            </span>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              ({ACCOUNT_TYPE_LABELS[data.account.type] ?? data.account.type})
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">날짜</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">적요</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">상대계정</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">차변</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">대변</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">잔액</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {startDate && (
                <tr className="bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 italic">
                  <td className="px-4 py-2" colSpan={5}>전기이월</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.openingBalance)}</td>
                </tr>
              )}
              {data.entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                    {e.transactionDescription}
                    {e.entryDescription && <span className="ml-1 text-gray-400 text-xs">({e.entryDescription})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.counterpart}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{e.debit > 0 ? formatCurrency(e.debit) : '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{e.credit > 0 ? formatCurrency(e.credit) : '-'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${e.balance < 0 ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                    {formatCurrency(e.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.entries.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">해당 기간에 거래 내역이 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── 손익계산서 ────────────────────────────────────────────────────────────────

interface IncomeStatementRow {
  id: string
  code: string
  name: string
  balance: number
}

interface IncomeStatementData {
  revenues: IncomeStatementRow[]
  expenses: IncomeStatementRow[]
  totalRevenue: number
  totalExpense: number
  netIncome: number
}

function IncomeStatement() {
  const [data, setData] = useState<IncomeStatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(currentYear()))
  const [month, setMonth] = useState('')

  const load = useCallback(async () => {
    if (!year) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year })
      if (month) params.set('month', month)
      const res = await fetch(`/api/reports/income-statement?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '손익계산서를 불러오지 못했습니다.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : '손익계산서를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">연도</label>
          <input
            type="number"
            value={year}
            onChange={e => setYear(e.target.value)}
            min="2000"
            max="2100"
            className="w-24 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">월 (선택)</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={String(m)}>{m}월</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">로딩 중...</div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 수익 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="px-4 py-3 border-b dark:border-gray-700 bg-green-50 dark:bg-green-900/20 rounded-t-xl">
              <h3 className="font-semibold text-green-800 dark:text-green-400">수익</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y dark:divide-gray-700">
                {data.revenues.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.code}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.name}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700 dark:text-green-400">{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">총 수익</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700 dark:text-green-400">{formatCurrency(data.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
            {data.revenues.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">수익 내역이 없습니다.</p>
            )}
          </div>

          {/* 비용 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="px-4 py-3 border-b dark:border-gray-700 bg-red-50 dark:bg-red-900/20 rounded-t-xl">
              <h3 className="font-semibold text-red-800 dark:text-red-400">비용</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y dark:divide-gray-700">
                {data.expenses.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.code}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.name}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-700 dark:text-red-400">{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">총 비용</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-700 dark:text-red-400">{formatCurrency(data.totalExpense)}</td>
                </tr>
              </tfoot>
            </table>
            {data.expenses.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">비용 내역이 없습니다.</p>
            )}
          </div>

          {/* 순손익 */}
          <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4 flex justify-between items-center">
            <span className="font-bold text-lg text-gray-900 dark:text-gray-100">당기순이익</span>
            <span className={`text-2xl font-bold ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatCurrency(data.netIncome)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── 재무상태표 ────────────────────────────────────────────────────────────────

interface BalanceSheetRow {
  id: string
  code: string
  name: string
  balance: number
}

interface BalanceSheetData {
  assets: BalanceSheetRow[]
  liabilities: BalanceSheetRow[]
  equity: BalanceSheetRow[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
}

function SectionTable({ title, rows, total, colorClass }: {
  title: string
  rows: BalanceSheetRow[]
  total: number
  colorClass: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
      <div className={`px-4 py-3 border-b dark:border-gray-700 rounded-t-xl ${colorClass}`}>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y dark:divide-gray-700">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.code}</td>
              <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.name}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(r.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <td colSpan={2} className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">소계</td>
            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
      {rows.length === 0 && (
        <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">내역이 없습니다.</p>
      )}
    </div>
  )
}

function isBalanceSheetData(value: unknown): value is BalanceSheetData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    Array.isArray(data.assets) &&
    Array.isArray(data.liabilities) &&
    Array.isArray(data.equity) &&
    typeof data.totalAssets === 'number' &&
    typeof data.totalLiabilities === 'number' &&
    typeof data.totalEquity === 'number'
  )
}

function BalanceSheet() {
  const [data, setData] = useState<BalanceSheetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadBalanceSheet = async () => {
      try {
        const res = await fetch('/api/reports/balance-sheet')
        const json: unknown = await res.json()

        if (!res.ok) {
          const message =
            json &&
            typeof json === 'object' &&
            'error' in json &&
            typeof (json as { error?: unknown }).error === 'string'
              ? (json as { error: string }).error
              : '재무상태표를 불러오는 중 오류가 발생했습니다.'
          throw new Error(message)
        }

        if (!isBalanceSheetData(json)) {
          throw new Error('재무상태표 응답 형식이 올바르지 않습니다.')
        }

        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : '재무상태표를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    loadBalanceSheet()
  }, [])

  if (loading) return <div className="text-center py-8 text-gray-500 dark:text-gray-400">로딩 중...</div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
  if (!data) return null

  const balanced = Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < BALANCE_TOLERANCE

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionTable
          title="자산"
          rows={data.assets}
          total={data.totalAssets}
          colorClass="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400"
        />
        <div className="space-y-4">
          <SectionTable
            title="부채"
            rows={data.liabilities}
            total={data.totalLiabilities}
            colorClass="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400"
          />
          <SectionTable
            title="자본"
            rows={data.equity}
            total={data.totalEquity}
            colorClass="bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-400"
          />
        </div>
      </div>

      {/* 대차 균형 */}
      <div className={`rounded-xl shadow-sm border p-4 flex justify-between items-center ${balanced ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
        <div>
          <p className={`text-sm font-medium ${balanced ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {balanced ? '✓ 대차 균형' : '⚠ 대차 불균형'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            자산 {formatCurrency(data.totalAssets)} = 부채 {formatCurrency(data.totalLiabilities)} + 자본 {formatCurrency(data.totalEquity)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('trial-balance')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">보고서</h1>

      {/* 탭 */}
      <div className="flex border-b dark:border-gray-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium transition-colors -mb-px border-b-2 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'trial-balance' && <TrialBalance />}
      {activeTab === 'ledger' && <Ledger />}
      {activeTab === 'income-statement' && <IncomeStatement />}
      {activeTab === 'balance-sheet' && <BalanceSheet />}
    </div>
  )
}
