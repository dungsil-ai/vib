export const SUPPORTED_CURRENCIES = ['KRW', 'USD', 'JPY', 'EUR'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  KRW: 'KRW ₩',
  USD: 'USD $',
  JPY: 'JPY ¥',
  EUR: 'EUR €',
}

export function formatCurrency(amount: number, currency: SupportedCurrency = 'KRW') {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(amount)
}
