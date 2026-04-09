'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

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

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchTransactions = async () => {
    try {
      setError(null)
      const res = await fetch('/api/transactions')
      if (!res.ok) {
        throw new Error(`거래 내역을 불러오지 못했습니다. (${res.status})`)
      }
      const data = await res.json()
      setTransactions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '거래 내역을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTransactions() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('이 거래를 삭제하시겠습니까?')) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    fetchTransactions()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-gray-500">로딩 중...</div></div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-full"><div className="text-red-500">{error}</div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">거래 내역</h1>
        <Link
          href="/transactions/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + 거래 추가
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-500 mb-4">거래 내역이 없습니다.</p>
          <Link href="/transactions/new" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            첫 거래를 기록해보세요 →
          </Link>
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
                  const totalAmount = tx.entries.reduce((sum, e) => sum + Number(e.amount), 0)
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
                          {formatCurrency(totalAmount)}
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
