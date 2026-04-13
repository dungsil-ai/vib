'use client'

import React, { memo, useEffect, useMemo, useState } from 'react'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/currencies'

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface EntryForm {
  id: string
  debitAccountId: string
  creditAccountId: string
  amount: string
  currency: string
  exchangeRate: string
  description: string
}

interface AccountOption {
  id: string
  label: string
}

interface AccountBadgePickerProps {
  label: string
  labelClassName: string
  accountOptions: AccountOption[]
  accountsLoading: boolean
  accountsError: string | null
  hasActiveFilter: boolean
  selectedAccountId: string
  onSelect: (accountId: string) => void
  activeClassName: string
  inactiveClassName: string
}

const AccountBadgePicker = memo(function AccountBadgePicker({
  label,
  labelClassName,
  accountOptions,
  accountsLoading,
  accountsError,
  hasActiveFilter,
  selectedAccountId,
  onSelect,
  activeClassName,
  inactiveClassName,
}: AccountBadgePickerProps) {
  return (
    <div>
      <span className={`block text-xs font-medium mb-1.5 ${labelClassName}`}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {accountOptions.map(option => {
          const selected = selectedAccountId === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? '' : option.id)}
              className={[
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                selected ? activeClassName : inactiveClassName,
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
        {accountOptions.length === 0 && (
          <span className={`text-xs ${accountsError ? 'text-red-500' : 'text-gray-400'}`}>
            {accountsLoading
              ? '계정 목록 로딩 중...'
              : accountsError
                ? '계정 목록을 불러오지 못했습니다.'
                : hasActiveFilter
                  ? '검색 결과가 없습니다.'
                  : '등록된 계정이 없습니다.'}
          </span>
        )}
      </div>
    </div>
  )
})

interface Entry {
  id: string
  amount: string
  currency: string
  exchangeRate: string
  description: string | null
  debitAccount: { name: string; code: string; type: string }
  creditAccount: { name: string; code: string; type: string }
}

interface Transaction {
  id: string
  date: string
  description: string
  entries: Entry[]
  createdAt: string
}

const defaultEntry = (baseCurrency = 'KRW'): EntryForm => ({
  id: crypto.randomUUID(),
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
  currency: baseCurrency,
  exchangeRate: '1',
  description: '',
})

const todayDate = () => {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().split('T')[0]
}

export default function TransactionsPage() {
  // --- list state ---
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // --- form state ---
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [accountFilter, setAccountFilter] = useState('')
  const [date, setDate] = useState(todayDate())
  const [txDescription, setTxDescription] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('KRW')
  const [entries, setEntries] = useState<EntryForm[]>([defaultEntry('KRW')])
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const hasActiveFilter = accountFilter.trim().length > 0
  const filteredAccounts = useMemo(() => {
    if (!hasActiveFilter) return accounts
    const term = accountFilter.trim().toLowerCase()
    return accounts.filter(acc =>
      acc.name.toLowerCase().includes(term) ||
      acc.code.toLowerCase().includes(term),
    )
  }, [accounts, accountFilter, hasActiveFilter])

  const accountOptions = useMemo(
    () => filteredAccounts.map(acc => ({ id: acc.id, label: `${acc.code} ${acc.name}` })),
    [filteredAccounts],
  )

  const fetchTransactions = async (isCancelled: () => boolean = () => false) => {
    try {
      if (!isCancelled()) {
        setListError(null)
      }
      const res = await fetch('/api/transactions')
      if (!res.ok) {
        throw new Error(`거래 내역을 불러오지 못했습니다. (${res.status})`)
      }
      const data = await res.json()
      if (!isCancelled()) {
        setTransactions(data)
      }
    } catch (err) {
      if (!isCancelled()) {
        setListError(err instanceof Error ? err.message : '거래 내역을 불러오는 중 오류가 발생했습니다.')
      }
    } finally {
      if (!isCancelled()) {
        setListLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [accountsRes, settingsRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/settings'),
        ])

        if (!accountsRes.ok) {
          throw new Error(`계정 목록을 불러오지 못했습니다. (${accountsRes.status})`)
        }

        const [accountsData, settingsData] = await Promise.all([
          accountsRes.json(),
          settingsRes.ok ? settingsRes.json() : Promise.resolve({ currency: 'KRW' }),
        ])

        if (!cancelled) {
          setAccounts(accountsData)
          const userCurrency = settingsData.currency ?? 'KRW'
          setBaseCurrency(userCurrency)
          setEntries([defaultEntry(userCurrency)])
        }
      } catch (err) {
        if (!cancelled) {
          setAccountsError(err instanceof Error ? err.message : '계정 목록을 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) {
          setAccountsLoading(false)
        }
      }
    }

    init()
    fetchTransactions(() => cancelled)

    return () => { cancelled = true }
  }, [])

  const resetForm = () => {
    setFormError('')
    setDate(todayDate())
    setTxDescription('')
    setEntries([defaultEntry(baseCurrency)])
  }

  // --- entry helpers ---
  const addEntry = () => setEntries(prev => [...prev, defaultEntry(baseCurrency)])
  const removeEntry = (index: number) => {
    setEntries(prev => {
      if (prev.length === 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }
  const updateEntry = (index: number, field: keyof EntryForm, value: string) => {
    setEntries(prev => {
      const updated = [...prev]
      const newEntry = { ...updated[index], [field]: value }
      // When currency changes back to base currency, reset exchange rate to 1
      if (field === 'currency' && value === baseCurrency) {
        newEntry.exchangeRate = '1'
      }
      updated[index] = newEntry
      return updated
    })
  }

  const formTotal = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const formTotalBase = entries.reduce((sum, e) => sum + (Number(e.amount) || 0) * (Number(e.exchangeRate) || 1), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    for (const entry of entries) {
      if (!entry.debitAccountId || !entry.creditAccountId || !entry.amount) {
        setFormError('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')
        setSubmitting(false)
        return
      }
      if (entry.debitAccountId === entry.creditAccountId) {
        setFormError('차변 계정과 대변 계정은 달라야 합니다.')
        setSubmitting(false)
        return
      }
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          description: txDescription,
          entries: entries.map(entry => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
            currency: entry.currency,
            exchangeRate: entry.exchangeRate,
            description: entry.description || undefined,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '오류가 발생했습니다.')
        return
      }

      resetForm()
      setListLoading(true)
      fetchTransactions()
    } catch {
      setFormError('거래 저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // --- delete ---
  const handleDelete = async (id: string) => {
    if (!confirm('이 거래를 삭제하시겠습니까?')) return
    try {
      setListError(null)
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`거래를 삭제하지 못했습니다. (${res.status})`)
      fetchTransactions()
    } catch (err) {
      setListError(err instanceof Error ? err.message : '거래를 삭제하는 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">거래 내역</h1>

      {/* ── Add transaction form ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">거래 추가</h2>

        {formError && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
            {formError}
          </div>
        )}

        {accountsError && (
          <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 px-4 py-3 rounded text-sm">
            {accountsError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">날짜</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">거래 설명</label>
              <input
                type="text"
                value={txDescription}
                onChange={e => setTxDescription(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="거래 내용을 입력하세요"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">분개 항목</h3>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <label htmlFor="account-search" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  계정 검색
                </label>
                <input
                  id="account-search"
                  type="text"
                  value={accountFilter}
                  onChange={e => setAccountFilter(e.target.value)}
                  className="w-full md:w-56 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="코드나 이름으로 검색"
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  총액: <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(formTotal, entries[0]?.currency ?? baseCurrency)}
                    {entries.some(e => e.currency !== baseCurrency) && (
                      <span className="ml-1 text-xs text-gray-400">
                        ≈ {formatCurrency(formTotalBase, baseCurrency)}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div key={entry.id} className="border dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">항목 {index + 1}</span>
                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {/* Debit / Credit badge pickers — side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Debit account badge picker */}
                      <AccountBadgePicker
                        label="차변 (Debit)"
                        labelClassName="text-red-700"
                        accountOptions={accountOptions}
                        accountsLoading={accountsLoading}
                        accountsError={accountsError}
                        hasActiveFilter={hasActiveFilter}
                        selectedAccountId={entry.debitAccountId}
                        onSelect={accountId => updateEntry(index, 'debitAccountId', accountId)}
                        activeClassName="bg-red-100 text-red-700 border-red-300"
                        inactiveClassName="bg-white text-gray-600 border-gray-300 hover:border-red-300 hover:text-red-600"
                      />

                      {/* Credit account badge picker */}
                      <AccountBadgePicker
                        label="대변 (Credit)"
                        labelClassName="text-green-700"
                        accountOptions={accountOptions}
                        accountsLoading={accountsLoading}
                        accountsError={accountsError}
                        hasActiveFilter={hasActiveFilter}
                        selectedAccountId={entry.creditAccountId}
                        onSelect={accountId => updateEntry(index, 'creditAccountId', accountId)}
                        activeClassName="bg-green-100 text-green-700 border-green-300"
                        inactiveClassName="bg-white text-gray-600 border-gray-300 hover:border-green-300 hover:text-green-600"
                      />
                    </div>

                    {/* Amount, currency & memo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">금액</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={entry.amount}
                            onChange={e => updateEntry(index, 'amount', e.target.value)}
                            className="flex-1 min-w-0 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="0"
                            min="1"
                            required
                          />
                          <select
                            value={entry.currency}
                            onChange={e => updateEntry(index, 'currency', e.target.value)}
                            className="px-2 py-2 border dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            aria-label="통화"
                          >
                            {SUPPORTED_CURRENCIES.map(c => (
                              <option key={c.code} value={c.code}>{c.code}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {entry.currency !== baseCurrency ? (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            환율 (1 {entry.currency} = ? {baseCurrency})
                          </label>
                          <input
                            type="number"
                            value={entry.exchangeRate}
                            onChange={e => updateEntry(index, 'exchangeRate', e.target.value)}
                            className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="1"
                            min="0.000001"
                            step="any"
                            required
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">메모 (선택)</label>
                          <input
                            type="text"
                            value={entry.description}
                            onChange={e => updateEntry(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="항목 설명"
                          />
                        </div>
                      )}
                    </div>
                    {entry.currency !== baseCurrency && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">메모 (선택)</label>
                        <input
                          type="text"
                          value={entry.description}
                          onChange={e => updateEntry(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="항목 설명"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addEntry}
              className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:border-blue-400 hover:text-blue-500 rounded-lg text-sm"
            >
              + 항목 추가
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? '저장 중...' : '거래 저장'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
            >
              초기화
            </button>
          </div>
        </form>
      </div>

      {/* ── Transaction list ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">거래 목록</h2>

        {listError && (
          <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
            {listError}
          </div>
        )}

        {listLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-12 text-center">
            <div className="text-gray-500 dark:text-gray-400">로딩 중...</div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">거래 내역이 없습니다. 위 폼에서 첫 거래를 기록해보세요.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">날짜</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">설명</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">차변 계정</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">대변 계정</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">금액</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {transactions.map(tx => {
                    // Show total in base currency (amount * exchangeRate)
                    const txTotal = tx.entries.reduce((sum, e) => sum + Number(e.amount) * (Number(e.exchangeRate) || 1), 0)
                    const hasForeignCurrency = tx.entries.some(e => e.currency && e.currency !== baseCurrency)
                    const isExpanded = expandedId === tx.id
                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                        >
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {new Date(tx.date).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                            {tx.description}
                            {tx.entries.length > 1 && (
                              <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                {tx.entries.length}개 항목
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {tx.entries.map(e => e.debitAccount.name).join(', ')}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {tx.entries.map(e => e.creditAccount.name).join(', ')}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(txTotal, baseCurrency)}
                            {hasForeignCurrency && (
                              <span className="ml-1 text-xs text-gray-400">(환산)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(tx.id) }}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                        {isExpanded && tx.entries.length > 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
                              <div className="space-y-1">
                                {tx.entries.map(entry => (
                                  <div key={entry.id} className="flex items-center gap-4 text-xs">
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                                      차변: {entry.debitAccount.name}
                                    </span>
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                                      대변: {entry.creditAccount.name}
                                    </span>
                                    <span className="font-medium dark:text-gray-300">
                                      {formatCurrency(Number(entry.amount), entry.currency ?? baseCurrency)}
                                      {entry.currency && entry.currency !== baseCurrency && (
                                        <span className="ml-1 text-gray-400">
                                          ≈ {formatCurrency(Number(entry.amount) * (Number(entry.exchangeRate) || 1), baseCurrency)}
                                        </span>
                                      )}
                                    </span>
                                    {entry.description && (
                                      <span className="text-gray-500 dark:text-gray-400">{entry.description}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
