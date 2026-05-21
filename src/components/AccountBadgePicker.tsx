'use client'

import { memo } from 'react'

export interface AccountOption {
  id: string
  label: string
}

export interface AccountBadgePickerProps {
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

function getAccountPickerEmptyStateMessage({
  accountsLoading,
  accountsError,
  hasActiveFilter,
}: Pick<AccountBadgePickerProps, 'accountsLoading' | 'accountsError' | 'hasActiveFilter'>) {
  if (accountsLoading) return '계정 목록 로딩 중...'
  if (accountsError) return '계정 목록을 불러오지 못했습니다.'
  if (hasActiveFilter) return '검색 결과가 없습니다.'
  return '등록된 계정이 없습니다.'
}

export const AccountBadgePicker = memo(function AccountBadgePicker({
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
