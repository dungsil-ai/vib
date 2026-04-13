'use client'

import { useEffect, useState } from 'react'

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  EQUITY: '자본',
  REVENUE: '수익',
  EXPENSE: '비용',
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  LIABILITY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  EQUITY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  REVENUE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  EXPENSE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

interface Account {
  id: string
  code: string
  name: string
  type: string
  description: string | null
  balance: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormFor, setShowFormFor] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ name: '', description: '' })
  const [editError, setEditError] = useState('')

  const fetchAccounts = async () => {
    setError('')
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '계정 목록을 불러오지 못했습니다.')
      }
      setAccounts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '계정 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!showFormFor) {
      setFormError('계정 유형을 선택해주세요.')
      return
    }
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, type: showFormFor }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '오류가 발생했습니다.')
      } else {
        setShowFormFor(null)
        setFormData({ name: '', description: '' })
        fetchAccounts()
      }
    } catch {
      setFormError('네트워크 오류가 발생했습니다.')
    }
  }

  const startEditing = (account: Account) => {
    setEditingId(account.id)
    setEditData({ name: account.name, description: account.description || '' })
    setEditError('')
    setShowFormFor(null)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditData({ name: '', description: '' })
    setEditError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setEditError('')
    try {
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editData.name, description: editData.description }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error || '수정에 실패했습니다.')
      } else {
        cancelEditing()
        fetchAccounts()
      }
    } catch {
      setEditError('네트워크 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 계정을 삭제하시겠습니까?')) return
    setError('')
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    let data: { error?: string } | null = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      setError(data?.error || '계정을 삭제하지 못했습니다.')
      return
    }
    fetchAccounts()
  }

  const groupedAccounts = Object.entries(ACCOUNT_TYPE_LABELS).reduce((acc, [type]) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<string, Account[]>)

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-gray-500 dark:text-gray-400">로딩 중...</div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">계정 관리</h1>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(ACCOUNT_TYPE_LABELS).map(([type, label]) => {
          const typeAccounts = groupedAccounts[type] || []
          const isFormOpen = showFormFor === type
          return (
            <div key={type} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
              <div className="p-4 border-b dark:border-gray-700 flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${ACCOUNT_TYPE_COLORS[type]}`}>{label}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">({typeAccounts.length}개)</span>
              </div>
              {typeAccounts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">계정명</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">설명</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">잔액</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {typeAccounts.map(account => (
                        editingId === account.id ? (
                          <tr key={account.id} className="bg-blue-50 dark:bg-blue-900/20">
                            <td colSpan={4} className="px-4 py-3">
                              {editError && <div className="mb-2 text-red-600 text-sm">{editError}</div>}
                              <form onSubmit={handleEdit} className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="text"
                                  value={editData.name}
                                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                                  className="px-2 py-1 border dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                                  placeholder="계정명"
                                  required
                                  autoFocus
                                />
                                <input
                                  type="text"
                                  value={editData.description}
                                  onChange={e => setEditData({ ...editData, description: e.target.value })}
                                  className="flex-1 px-2 py-1 border dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                                  placeholder="설명 (선택)"
                                />
                                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">저장</button>
                                <button type="button" onClick={cancelEditing} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600">취소</button>
                              </form>
                            </td>
                          </tr>
                        ) : (
                          <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{account.name}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{account.description || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium">
                              <span className={account.balance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}>
                                {formatCurrency(account.balance)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => startEditing(account)}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleDelete(account.id)}
                                  className="text-xs text-red-600 hover:text-red-800"
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isFormOpen ? (
                <div className="p-4 border-t dark:border-gray-700">
                  {formError && <div className="mb-3 text-red-600 text-sm">{formError}</div>}
                  <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">계정명</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="예: 현금"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">설명 (선택)</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="계정 설명"
                      />
                    </div>
                    <div className="col-span-2 flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowFormFor(null); setFormData({ name: '', description: '' }); setFormError('') }}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-3">
                  <button
                    onClick={() => { setShowFormFor(type); setFormData({ name: '', description: '' }); setFormError('') }}
                    className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 rounded-lg text-sm"
                  >
                    + 계정 추가
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
