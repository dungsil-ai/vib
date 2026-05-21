'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">대시보드 데이터를 불러오지 못했습니다.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
      >
        다시 시도
      </button>
      {process.env.NODE_ENV !== 'production' && error.message
        ? <p className="text-xs text-red-600 dark:text-red-400">{error.message}</p>
        : null}
    </div>
  )
}
