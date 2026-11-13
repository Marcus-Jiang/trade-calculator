import type { Locale } from '@shared/i18n'

/** 常用贸易币种（10 种），顺序即选择器中的展示顺序 */
export const CURRENCIES: readonly string[] = [
  'CNY',
  'USD',
  'JPY',
  'EUR',
  'GBP',
  'HKD',
  'AUD',
  'CAD',
  'SGD',
  'CHF'
]

/** 币种名称随界面语言变化 */
export const CURRENCY_NAMES: Record<Locale, Record<string, string>> = {
  zh: {
    CNY: '人民币',
    USD: '美元',
    JPY: '日元',
    EUR: '欧元',
    GBP: '英镑',
    HKD: '港币',
    AUD: '澳元',
    CAD: '加元',
    SGD: '新加坡元',
    CHF: '瑞士法郎'
  },
  ja: {
    CNY: '人民元',
    USD: '米ドル',
    JPY: '日本円',
    EUR: 'ユーロ',
    GBP: '英ポンド',
    HKD: '香港ドル',
    AUD: '豪ドル',
    CAD: 'カナダドル',
    SGD: 'シンガポールドル',
    CHF: 'スイスフラン'
  }
}

export function currencyName(locale: Locale, code: string): string {
  return CURRENCY_NAMES[locale][code] ?? code
}
