export interface Currency {
  code: string
  name: string
  symbol: string
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'KRW', name: '한국 원', symbol: '₩' },
  { code: 'USD', name: '미국 달러', symbol: '$' },
  { code: 'EUR', name: '유로', symbol: '€' },
  { code: 'JPY', name: '일본 엔', symbol: '¥' },
  { code: 'GBP', name: '영국 파운드', symbol: '£' },
  { code: 'CNY', name: '중국 위안', symbol: '¥' },
  { code: 'HKD', name: '홍콩 달러', symbol: 'HK$' },
  { code: 'SGD', name: '싱가포르 달러', symbol: 'S$' },
  { code: 'AUD', name: '호주 달러', symbol: 'A$' },
  { code: 'CAD', name: '캐나다 달러', symbol: 'C$' },
  { code: 'CHF', name: '스위스 프랑', symbol: 'CHF' },
  { code: 'THB', name: '태국 바트', symbol: '฿' },
  { code: 'VND', name: '베트남 동', symbol: '₫' },
]

export function getCurrencyByCode(code: string): Currency | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)
}

export function formatCurrency(amount: number, currency = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(amount)
}

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code)
