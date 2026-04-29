'use client'

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/currencies'

// ─── Shared types ──────────────────────────────────────────────────────────────

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

// ─── Shared utilities ─────────────────────────────────────────────────────────

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

const getAccountPickerEmptyStateMessage = ({
  accountsLoading,
  accountsError,
  hasActiveFilter,
}: Pick<AccountBadgePickerProps, 'accountsLoading' | 'accountsError' | 'hasActiveFilter'>) => {
  if (accountsLoading) return '계정 목록 로딩 중...'
  if (accountsError) return '계정 목록을 불러오지 못했습니다.'
  if (hasActiveFilter) return '검색 결과가 없습니다.'
  return '등록된 계정이 없습니다.'
}

const getTransactionSubmitButtonLabel = ({
  submitting,
  editingTransactionId,
}: {
  submitting: boolean
  editingTransactionId: string | null
}) => {
  if (submitting) {
    return editingTransactionId ? '수정 중...' : '저장 중...'
  }

  return editingTransactionId ? '거래 수정 저장' : '거래 저장'
}

// ─── Shared component ─────────────────────────────────────────────────────────

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
  const emptyStateMessage = getAccountPickerEmptyStateMessage({ accountsLoading, accountsError, hasActiveFilter })

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
            {emptyStateMessage}
          </span>
        )}
      </div>
    </div>
  )
})

// ─── Transactions tab ─────────────────────────────────────────────────────────

interface Entry {
  id: string
  debitAccountId: string
  creditAccountId: string
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

interface TransactionsTabProps {
  accounts: Account[]
  accountsLoading: boolean
  accountsError: string | null
}

function TransactionsTab({ accounts, accountsLoading, accountsError }: TransactionsTabProps) {
  // --- list state ---
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // --- list filter state ---
  const [listKeyword, setListKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [listAccountId, setListAccountId] = useState('')
  const [listStartDate, setListStartDate] = useState('')
  const [listEndDate, setListEndDate] = useState('')
  const [listMinAmount, setListMinAmount] = useState('')
  const [listMaxAmount, setListMaxAmount] = useState('')
  const [listSortBy, setListSortBy] = useState('date')
  const [listSortOrder, setListSortOrder] = useState('desc')

  // --- pagination state ---
  const [listPage, setListPage] = useState(1)
  const LIST_PAGE_SIZE = 20
  const [listTotal, setListTotal] = useState(0)

  // --- form state ---
  const [accountFilter, setAccountFilter] = useState('')
  const [date, setDate] = useState(todayDate())
  const [txDescription, setTxDescription] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('KRW')
  const [entries, setEntries] = useState<EntryForm[]>([defaultEntry('KRW')])
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
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

  const buildListUrl = useCallback((page: number) => {
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('pageSize', String(LIST_PAGE_SIZE))
    if (debouncedKeyword.trim()) qs.set('keyword', debouncedKeyword.trim())
    if (listAccountId) qs.set('accountId', listAccountId)
    if (listStartDate) qs.set('startDate', listStartDate)
    if (listEndDate) qs.set('endDate', listEndDate)
    if (listMinAmount) qs.set('minAmount', listMinAmount)
    if (listMaxAmount) qs.set('maxAmount', listMaxAmount)
    if (listSortBy !== 'date') qs.set('sortBy', listSortBy)
    if (listSortOrder !== 'desc') qs.set('sortOrder', listSortOrder)
    return `/api/transactions?${qs.toString()}`
  }, [debouncedKeyword, listAccountId, listStartDate, listEndDate, listMinAmount, listMaxAmount, listSortBy, listSortOrder])

  const fetchTransactions = useCallback(async (page: number, isCancelled: () => boolean = () => false) => {
    try {
      if (!isCancelled()) {
        setListError(null)
      }
      const res = await fetch(buildListUrl(page))
      if (!res.ok) {
        throw new Error(`거래 내역을 불러오지 못했습니다. (${res.status})`)
      }
      const body = await res.json()
      if (!isCancelled()) {
        setTransactions(body.data ?? body)
        setListTotal(body.total ?? 0)
        setListPage(body.page ?? page)
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
  }, [buildListUrl])

  // Debounce keyword input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(listKeyword)
    }, 300)
    return () => clearTimeout(timer)
  }, [listKeyword])

  // Fetch user's base currency on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : { currency: 'KRW' })
      .then(d => {
        if (!cancelled && d.currency) {
          setBaseCurrency(d.currency)
          setEntries([defaultEntry(d.currency)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Re-fetch when filters change (reset to page 1)
  useEffect(() => {
    let cancelled = false
    setListLoading(true)
    fetchTransactions(1, () => cancelled)
    return () => { cancelled = true }
  }, [fetchTransactions])


  const populateForm = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id)
    setDate(new Date(transaction.date).toISOString().split('T')[0])
    setTxDescription(transaction.description)
    setEntries(
      transaction.entries.length > 0
        ? transaction.entries.map(entry => ({
            id: entry.id,
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
            currency: entry.currency ?? baseCurrency,
            exchangeRate: entry.exchangeRate ?? '1',
            description: entry.description ?? '',
          }))
        : [defaultEntry(baseCurrency)],
    )
    setFormError('')
  }

  const resetForm = () => {
    setEditingTransactionId(null)
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

  const totalsByCurrency = entries.reduce<Record<string, number>>((totals, entry) => {
    const currency = entry.currency || baseCurrency
    const amount = Number(entry.amount) || 0
    totals[currency] = (totals[currency] || 0) + amount
    return totals
  }, {})
  const hasMixedCurrencies = Object.keys(totalsByCurrency).length > 1
  const formTotalBase = entries.reduce((sum, e) => sum + (Number(e.amount) || 0) * (Number(e.exchangeRate) || 1), 0)
  const firstEntryCurrency = entries.length > 0 ? (entries[0].currency || baseCurrency) : baseCurrency
  const formTotal = hasMixedCurrencies
    ? formTotalBase
    : (totalsByCurrency[firstEntryCurrency] || 0)
  const formTotalCurrency = hasMixedCurrencies ? baseCurrency : firstEntryCurrency
  const submitButtonLabel = getTransactionSubmitButtonLabel({ submitting, editingTransactionId })
  const resetButtonLabel = editingTransactionId ? '수정 취소' : '초기화'

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
      const isEditing = editingTransactionId !== null
      const res = await fetch(isEditing ? `/api/transactions/${editingTransactionId}` : '/api/transactions', {
        method: isEditing ? 'PUT' : 'POST',
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
      fetchTransactions(listPage)
    } catch {
      setFormError(editingTransactionId ? '거래 수정 중 오류가 발생했습니다.' : '거래 저장 중 오류가 발생했습니다.')
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
      if (editingTransactionId === id) {
        resetForm()
      }
      setListLoading(true)
      fetchTransactions(listPage)
    } catch (err) {
      setListError(err instanceof Error ? err.message : '거래를 삭제하는 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Add transaction form ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
        <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingTransactionId ? '거래 수정' : '거래 추가'}
          </h2>
          {editingTransactionId && (
            <span className="text-sm text-blue-600 dark:text-blue-400">
              기존 거래를 수정 중입니다.
            </span>
          )}
        </div>

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
              <label htmlFor="tx-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">날짜</label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label htmlFor="tx-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">거래 설명</label>
              <input
                id="tx-description"
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
                <label htmlFor="tx-account-search" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  계정 검색
                </label>
                <input
                  id="tx-account-search"
                  type="text"
                  value={accountFilter}
                  onChange={e => setAccountFilter(e.target.value)}
                  className="w-full md:w-56 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="코드나 이름으로 검색"
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  총액: <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(formTotal, formTotalCurrency)}
                    {hasMixedCurrencies && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({baseCurrency} 환산 기준)
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
              {submitButtonLabel}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
            >
              {resetButtonLabel}
            </button>
          </div>
        </form>
      </div>

      {/* ── Transaction list ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">거래 목록</h2>

        {/* ── Filter bar ── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4 mb-3 space-y-3">
          {/* Row 1: keyword + account + sort */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="list-keyword" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                키워드
              </label>
              <input
                id="list-keyword"
                type="text"
                value={listKeyword}
                onChange={e => setListKeyword(e.target.value)}
                placeholder="거래 설명 검색"
                className="w-full px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="list-account" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                계정
              </label>
              <select
                id="list-account"
                value={listAccountId}
                onChange={e => setListAccountId(e.target.value)}
                className="w-full px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">전체 계정</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.code} {acc.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label htmlFor="list-sort-by" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  정렬 기준
                </label>
                <select
                  id="list-sort-by"
                  value={listSortBy}
                  onChange={e => setListSortBy(e.target.value)}
                  className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="date">날짜</option>
                  <option value="createdAt">등록일</option>
                </select>
              </div>
              <div>
                <label htmlFor="list-sort-order" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  정렬 방향
                </label>
                <select
                  id="list-sort-order"
                  value={listSortOrder}
                  onChange={e => setListSortOrder(e.target.value)}
                  className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="desc">최신순</option>
                  <option value="asc">오래된순</option>
                </select>
              </div>
            </div>
          </div>
          {/* Row 2: date range + amount range */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="list-start-date" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                시작일
              </label>
              <input
                id="list-start-date"
                type="date"
                value={listStartDate}
                onChange={e => setListStartDate(e.target.value)}
                className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="list-end-date" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                종료일
              </label>
              <input
                id="list-end-date"
                type="date"
                value={listEndDate}
                onChange={e => setListEndDate(e.target.value)}
                className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="list-min-amount" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                최소 금액
              </label>
              <input
                id="list-min-amount"
                type="number"
                value={listMinAmount}
                onChange={e => setListMinAmount(e.target.value)}
                placeholder="최소"
                min="0"
                className="w-32 px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="list-max-amount" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                최대 금액
              </label>
              <input
                id="list-max-amount"
                type="number"
                value={listMaxAmount}
                onChange={e => setListMaxAmount(e.target.value)}
                placeholder="제한 없음"
                min="0"
                className="w-32 px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setListKeyword('')
                setDebouncedKeyword('')
                setListAccountId('')
                setListStartDate('')
                setListEndDate('')
                setListMinAmount('')
                setListMaxAmount('')
                setListSortBy('date')
                setListSortOrder('desc')
              }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              필터 초기화
            </button>
          </div>
        </div>

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
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); populateForm(tx) }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                수정
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(tx.id) }}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                삭제
                              </button>
                            </div>
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

        {/* ── Pagination ── */}
        {!listLoading && listTotal > 0 && (listTotal > LIST_PAGE_SIZE || listPage > 1) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 flex items-center justify-between px-4 py-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {(() => {
                const totalPages = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE))
                const currentPage = Math.min(listPage, totalPages)
                const start = (currentPage - 1) * LIST_PAGE_SIZE + 1
                const end = Math.min(currentPage * LIST_PAGE_SIZE, listTotal)
                return <>총 {listTotal}건 중 {start}–{end}건</>
              })()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={listPage <= 1 || listLoading}
                onClick={() => {
                  const totalPages = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE))
                  const prev = Math.max(1, Math.min(listPage - 1, totalPages))
                  setListPage(prev)
                  setListLoading(true)
                  fetchTransactions(prev)
                }}
                className="px-3 py-1 text-xs border dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                이전
              </button>
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {Math.min(listPage, Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE)))} / {Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE))}
              </span>
              <button
                type="button"
                disabled={listPage >= Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE)) || listLoading}
                onClick={() => {
                  const totalPages = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE))
                  const next = Math.max(1, Math.min(listPage + 1, totalPages))
                  setListPage(next)
                  setListLoading(true)
                  fetchTransactions(next)
                }}
                className="px-3 py-1 text-xs border dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Recurring transactions tab ───────────────────────────────────────────────

interface RecurringEntry {
  id: string
  amount: string
  description: string | null
  debitAccount: { name: string; code: string; type: string }
  creditAccount: { name: string; code: string; type: string }
}

interface RecurringTransaction {
  id: string
  description: string
  frequency: string
  dayOfMonth: number | null
  monthOfYear: number | null
  startDate: string
  endDate: string | null
  nextRunAt: string
  lastRunAt: string | null
  isActive: boolean
  entries: RecurringEntry[]
  createdAt: string
}

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: '매일',
  WEEKLY: '매주',
  MONTHLY: '매월',
  YEARLY: '매년',
}

interface RecurringTabProps {
  accounts: Account[]
  accountsLoading: boolean
  accountsError: string | null
}

function RecurringTransactionsTab({ accounts, accountsLoading, accountsError }: RecurringTabProps) {
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)

  const [accountFilter, setAccountFilter] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState('MONTHLY')
  const [dayOfMonth, setDayOfMonth] = useState('25')
  const [monthOfYear, setMonthOfYear] = useState('1')
  const [startDate, setStartDate] = useState(todayDate())
  const [endDate, setEndDate] = useState('')
  const [entries, setEntries] = useState<EntryForm[]>([defaultEntry()])
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

  const fetchRecurring = (isCancelled: () => boolean = () => false) => {
    if (!isCancelled()) setListError(null)
    fetch('/api/recurring-transactions')
      .then(res => {
        if (!res.ok) throw new Error(`반복 거래를 불러오지 못했습니다. (${res.status})`)
        return res.json()
      })
      .then(data => { if (!isCancelled()) setRecurringList(data) })
      .catch(err => { if (!isCancelled()) setListError(err instanceof Error ? err.message : '반복 거래를 불러오는 중 오류가 발생했습니다.') })
      .finally(() => { if (!isCancelled()) setListLoading(false) })
  }

  useEffect(() => {
    let cancelled = false
    fetchRecurring(() => cancelled)
    return () => { cancelled = true }
  }, [])

  const resetForm = () => {
    setFormError('')
    setDescription('')
    setFrequency('MONTHLY')
    setDayOfMonth('25')
    setMonthOfYear('1')
    setStartDate(todayDate())
    setEndDate('')
    setEntries([defaultEntry()])
  }

  const addEntry = () => setEntries(prev => [...prev, defaultEntry()])
  const removeEntry = (index: number) => {
    setEntries(prev => {
      if (prev.length === 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }
  const updateEntry = (index: number, field: keyof EntryForm, value: string) => {
    setEntries(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const formTotal = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

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
      const res = await fetch('/api/recurring-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          frequency,
          dayOfMonth: (frequency === 'MONTHLY' || frequency === 'YEARLY') ? Number(dayOfMonth) : undefined,
          monthOfYear: frequency === 'YEARLY' ? Number(monthOfYear) : undefined,
          startDate,
          endDate: endDate || undefined,
          entries: entries.map(entry => ({
            debitAccountId: entry.debitAccountId,
            creditAccountId: entry.creditAccountId,
            amount: entry.amount,
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
      fetchRecurring()
    } catch {
      setFormError('반복 거래 저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      setListError(null)
      const res = await fetch(`/api/recurring-transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })
      if (!res.ok) throw new Error('상태 변경에 실패했습니다.')
      setRecurringList(prev =>
        prev.map(r => r.id === id ? { ...r, isActive: !currentActive } : r),
      )
    } catch (err) {
      setListError(err instanceof Error ? err.message : '상태 변경 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 반복 거래를 삭제하시겠습니까?')) return
    try {
      setListError(null)
      const res = await fetch(`/api/recurring-transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제에 실패했습니다.')
      setRecurringList(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setListError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/recurring-transactions/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '자동 생성에 실패했습니다.')
      setGenerateResult(`${data.generated}건의 거래가 자동 생성되었습니다.`)
      fetchRecurring()
    } catch (err) {
      setGenerateResult(err instanceof Error ? err.message : '자동 생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
        >
          {generating ? '생성 중...' : '지금 자동 생성'}
        </button>
      </div>

      {generateResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded text-sm">
          {generateResult}
        </div>
      )}

      {/* ── Add recurring transaction form ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">반복 거래 추가</h2>

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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">거래 설명</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="예: 월세, 통신비, 월급"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">반복 주기</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="DAILY">매일</option>
                <option value="WEEKLY">매주</option>
                <option value="MONTHLY">매월</option>
                <option value="YEARLY">매년</option>
              </select>
            </div>
          </div>

          {(frequency === 'MONTHLY' || frequency === 'YEARLY') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {frequency === 'YEARLY' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">반복 월 (1~12)</label>
                  <input
                    type="number"
                    value={monthOfYear}
                    onChange={e => setMonthOfYear(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    min="1"
                    max="12"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">반복 일 (1~28)</label>
                <input
                  type="number"
                  value={dayOfMonth}
                  onChange={e => setDayOfMonth(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  min="1"
                  max="28"
                  required
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">시작 날짜</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">종료 날짜 (선택)</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">분개 항목</h3>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <label htmlFor="rec-account-search" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  계정 검색
                </label>
                <input
                  id="rec-account-search"
                  type="text"
                  value={accountFilter}
                  onChange={e => setAccountFilter(e.target.value)}
                  className="w-full md:w-56 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="코드나 이름으로 검색"
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  총액: <span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(formTotal)}</span>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">금액 (원)</label>
                        <input
                          type="number"
                          value={entry.amount}
                          onChange={e => updateEntry(index, 'amount', e.target.value)}
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="0"
                          min="1"
                          required
                        />
                      </div>
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
                    </div>
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
              {submitting ? '저장 중...' : '반복 거래 저장'}
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

      {/* ── Recurring transaction list ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">반복 거래 목록</h2>

        {listError && (
          <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
            {listError}
          </div>
        )}

        {listLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-12 text-center">
            <div className="text-gray-500 dark:text-gray-400">로딩 중...</div>
          </div>
        ) : recurringList.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">등록된 반복 거래가 없습니다. 위 폼에서 추가해보세요.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">설명</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">주기</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">다음 실행일</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">마지막 실행일</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">금액</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">활성</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {recurringList.map(r => {
                    const total = r.entries.reduce((sum, e) => sum + Number(e.amount), 0)
                    const isExpanded = expandedId === r.id
                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                            {r.description}
                            {r.entries.length > 1 && (
                              <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                {r.entries.length}개 항목
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1">
                              {FREQUENCY_LABELS[r.frequency] ?? r.frequency}
                              {(r.frequency === 'MONTHLY' || r.frequency === 'YEARLY') && r.dayOfMonth && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {r.frequency === 'YEARLY' && r.monthOfYear ? `${r.monthOfYear}월 ` : ''}
                                  {r.dayOfMonth}일
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {new Date(r.nextRunAt).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {r.lastRunAt ? new Date(r.lastRunAt).toLocaleDateString('ko-KR') : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(total)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={e => { e.stopPropagation(); handleToggle(r.id, r.isActive) }}
                              className={`text-xs px-2 py-1 rounded ${r.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                              aria-label={r.isActive ? '비활성화' : '활성화'}
                            >
                              {r.isActive ? '활성' : '비활성'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                        {isExpanded && r.entries.length > 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
                              <div className="space-y-1">
                                {r.entries.map(entry => (
                                  <div key={entry.id} className="flex items-center gap-4 text-xs">
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                                      차변: {entry.debitAccount.name}
                                    </span>
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                                      대변: {entry.creditAccount.name}
                                    </span>
                                    <span className="font-medium dark:text-gray-300">{formatCurrency(Number(entry.amount))}</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'transactions' | 'recurring'

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('transactions')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/accounts')
      .then(res => {
        if (!res.ok) throw new Error(`계정 목록을 불러오지 못했습니다. (${res.status})`)
        return res.json()
      })
      .then(data => { if (!cancelled) setAccounts(data) })
      .catch(err => { if (!cancelled) setAccountsError(err instanceof Error ? err.message : '계정 목록을 불러오는 중 오류가 발생했습니다.') })
      .finally(() => { if (!cancelled) setAccountsLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">거래 내역</h1>

      {/* ── Tab navigation ── */}
      <div className="border-b dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="거래 탭">
          {([
            { id: 'transactions', label: '거래 내역' },
            { id: 'recurring', label: '반복 거래' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'transactions' ? (
        <TransactionsTab
          accounts={accounts}
          accountsLoading={accountsLoading}
          accountsError={accountsError}
        />
      ) : (
        <RecurringTransactionsTab
          accounts={accounts}
          accountsLoading={accountsLoading}
          accountsError={accountsError}
        />
      )}
    </div>
  )
}
