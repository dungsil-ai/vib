'use client'

import React, { useEffect, useState } from 'react'

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface EntryForm {
  debitAccountId: string
  creditAccountId: string
  amount: string
  description: string
}

interface Entry {
  id: string
  amount: string
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

const defaultEntry = (): EntryForm => ({
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
  description: '',
})

export default function TransactionsPage() {
  // --- list state ---
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // --- form state ---
  const [showForm, setShowForm] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [txDescription, setTxDescription] = useState('')
  const [entries, setEntries] = useState<EntryForm[]>([defaultEntry()])
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchTransactions = async () => {
    try {
      setListError(null)
      const res = await fetch('/api/transactions')
      if (!res.ok) {
        throw new Error(`거래 내역을 불러오지 못했습니다. (${res.status})`)
      }
      const data = await res.json()
      setTransactions(data)
    } catch (err) {
      setListError(err instanceof Error ? err.message : '거래 내역을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error(`계정 목록을 불러오지 못했습니다. (${res.status})`)
      const data = await res.json()
      setAccounts(data)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '계정 목록을 불러오는 중 오류가 발생했습니다.')
    }
  }

  useEffect(() => { fetchTransactions() }, [])

  const handleOpenForm = () => {
    setFormError('')
    setDate(new Date().toISOString().split('T')[0])
    setTxDescription('')
    setEntries([defaultEntry()])
    if (accounts.length === 0) fetchAccounts()
    setShowForm(true)
  }

  const handleCloseForm = () => setShowForm(false)

  // --- entry helpers ---
  const addEntry = () => setEntries([...entries, defaultEntry()])
  const removeEntry = (index: number) => {
    if (entries.length === 1) return
    setEntries(entries.filter((_, i) => i !== index))
  }
  const updateEntry = (index: number, field: keyof EntryForm, value: string) => {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: value }
    setEntries(updated)
  }

  const totalAmount = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

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
            description: entry.description || undefined,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '오류가 발생했습니다.')
        return
      }

      setShowForm(false)
      setLoading(true)
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">거래 내역</h1>
        <button
          onClick={handleOpenForm}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + 거래 추가
        </button>
      </div>

      {/* Slide-over add form */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30"
            onClick={handleCloseForm}
          />
          {/* Panel */}
          <div className="relative ml-auto w-full max-w-xl bg-white shadow-xl flex flex-col h-full overflow-y-auto z-50">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">거래 추가</h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-6 py-4">
              {formError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {formError}
                </div>
              )}

              <form id="new-tx-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">거래 설명</label>
                    <input
                      type="text"
                      value={txDescription}
                      onChange={e => setTxDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="거래 내용을 입력하세요"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium text-gray-900">분개 항목</h3>
                    <div className="text-sm text-gray-600">
                      총액: <span className="font-semibold text-blue-600">{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {entries.map((entry, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium text-gray-600">항목 {index + 1}</span>
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">차변 (Debit)</label>
                            <select
                              value={entry.debitAccountId}
                              onChange={e => updateEntry(index, 'debitAccountId', e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">계정 선택</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">대변 (Credit)</label>
                            <select
                              value={entry.creditAccountId}
                              onChange={e => updateEntry(index, 'creditAccountId', e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">계정 선택</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">금액 (원)</label>
                            <input
                              type="number"
                              value={entry.amount}
                              onChange={e => updateEntry(index, 'amount', e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                              min="1"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
                            <input
                              type="text"
                              value={entry.description}
                              onChange={e => updateEntry(index, 'description', e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="항목 설명"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addEntry}
                    className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500 rounded-lg text-sm"
                  >
                    + 항목 추가
                  </button>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t flex gap-3">
              <button
                type="submit"
                form="new-tx-form"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '저장 중...' : '거래 저장'}
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {listError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {listError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-500 mb-4">거래 내역이 없습니다.</p>
          <button
            onClick={handleOpenForm}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            첫 거래를 기록해보세요 →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">날짜</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">설명</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">차변 계정</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">대변 계정</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">금액</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map(tx => {
                  const txTotal = tx.entries.reduce((sum, e) => sum + Number(e.amount), 0)
                  const isExpanded = expandedId === tx.id
                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                      >
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(tx.date).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {tx.description}
                          {tx.entries.length > 1 && (
                            <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {tx.entries.length}개 항목
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {tx.entries.map(e => e.debitAccount.name).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {tx.entries.map(e => e.creditAccount.name).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(txTotal)}
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
                          <td colSpan={6} className="px-4 py-3 bg-blue-50">
                            <div className="space-y-1">
                              {tx.entries.map(entry => (
                                <div key={entry.id} className="flex items-center gap-4 text-xs">
                                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                    차변: {entry.debitAccount.name} ({entry.debitAccount.code})
                                  </span>
                                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                    대변: {entry.creditAccount.name} ({entry.creditAccount.code})
                                  </span>
                                  <span className="font-medium">{formatCurrency(Number(entry.amount))}</span>
                                  {entry.description && (
                                    <span className="text-gray-500">{entry.description}</span>
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
  )
}
