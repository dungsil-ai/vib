'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

export default function NewTransactionPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [entries, setEntries] = useState<EntryForm[]>([
    { debitAccountId: '', creditAccountId: '', amount: '', description: '' },
  ])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(data))
  }, [])

  const addEntry = () => {
    setEntries([...entries, { debitAccountId: '', creditAccountId: '', amount: '', description: '' }])
  }

  const removeEntry = (index: number) => {
    if (entries.length === 1) return
    setEntries(entries.filter((_, i) => i !== index))
  }

  const updateEntry = (index: number, field: keyof EntryForm, value: string) => {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: value }
    setEntries(updated)
  }

  const totalAmount = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    for (const entry of entries) {
      if (!entry.debitAccountId || !entry.creditAccountId || !entry.amount) {
        setError('모든 항목의 차변 계정, 대변 계정, 금액을 입력해주세요.')
        setLoading(false)
        return
      }
      if (entry.debitAccountId === entry.creditAccountId) {
        setError('차변 계정과 대변 계정은 달라야 합니다.')
        setLoading(false)
        return
      }
    }

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        description,
        entries: entries.map(e => ({
          debitAccountId: e.debitAccountId,
          creditAccountId: e.creditAccountId,
          amount: e.amount,
          description: e.description || undefined,
        })),
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || '오류가 발생했습니다.')
      setLoading(false)
    } else {
      router.push('/transactions')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/transactions" className="text-gray-500 hover:text-gray-700">← 뒤로</Link>
        <h1 className="text-2xl font-bold text-gray-900">거래 추가</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="거래 내용을 입력하세요"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-medium text-gray-900">분개 항목</h2>
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

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {loading ? '저장 중...' : '거래 저장'}
            </button>
            <Link
              href="/transactions"
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              취소
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
