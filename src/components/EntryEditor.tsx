'use client'

import { SUPPORTED_CURRENCIES } from '@/lib/currencies'
import { AccountBadgePicker, type AccountOption } from '@/components/AccountBadgePicker'

export interface EditableEntry {
  id: string
  debitAccountId: string
  creditAccountId: string
  amount: string
  currency: string
  exchangeRate: string
  description: string
}

interface EntryEditorProps {
  entry: EditableEntry
  index: number
  entryCount: number
  accountOptions: AccountOption[]
  accountsLoading: boolean
  accountsError: string | null
  hasActiveFilter: boolean
  baseCurrency: string
  amountLabel?: string
  showCurrency?: boolean
  onUpdate: (index: number, field: keyof EditableEntry, value: string) => void
  onRemove: (index: number) => void
}

export function EntryEditor({
  entry,
  index,
  entryCount,
  accountOptions,
  accountsLoading,
  accountsError,
  hasActiveFilter,
  baseCurrency,
  amountLabel = '금액',
  showCurrency = true,
  onUpdate,
  onRemove,
}: EntryEditorProps) {
  const showExchangeRate = showCurrency && entry.currency !== baseCurrency

  return (
    <div className="border dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">항목 {index + 1}</span>
        {entryCount > 1 && (
          <button
            type="button"
            onClick={() => onRemove(index)}
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
            onSelect={accountId => onUpdate(index, 'debitAccountId', accountId)}
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
            onSelect={accountId => onUpdate(index, 'creditAccountId', accountId)}
            activeClassName="bg-green-100 text-green-700 border-green-300"
            inactiveClassName="bg-white text-gray-600 border-gray-300 hover:border-green-300 hover:text-green-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{amountLabel}</label>
            {showCurrency ? (
              <div className="flex gap-1">
                <input
                  type="number"
                  value={entry.amount}
                  onChange={e => onUpdate(index, 'amount', e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="0"
                  min="1"
                  required
                />
                <select
                  value={entry.currency}
                  onChange={e => onUpdate(index, 'currency', e.target.value)}
                  className="px-2 py-2 border dark:border-gray-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  aria-label="통화"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                type="number"
                value={entry.amount}
                onChange={e => onUpdate(index, 'amount', e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="0"
                min="1"
                required
              />
            )}
          </div>
          {showExchangeRate ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                환율 (1 {entry.currency} = ? {baseCurrency})
              </label>
              <input
                type="number"
                value={entry.exchangeRate}
                onChange={e => onUpdate(index, 'exchangeRate', e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="1"
                min="0.000001"
                step="any"
                required
              />
            </div>
          ) : (
            <DescriptionInput
              value={entry.description}
              onChange={value => onUpdate(index, 'description', value)}
            />
          )}
        </div>
        {showExchangeRate && (
          <DescriptionInput
            value={entry.description}
            onChange={value => onUpdate(index, 'description', value)}
          />
        )}
      </div>
    </div>
  )
}

function DescriptionInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">메모 (선택)</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
        placeholder="항목 설명"
      />
    </div>
  )
}
