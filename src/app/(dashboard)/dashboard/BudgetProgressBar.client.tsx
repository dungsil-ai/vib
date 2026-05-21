'use client'

interface BudgetProgressBarProps {
  percent: number
  overBudget: boolean
}

export default function BudgetProgressBar({ percent, overBudget }: BudgetProgressBarProps) {
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${overBudget ? 'bg-red-500' : 'bg-blue-500'}`}
        style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
      />
    </div>
  )
}
