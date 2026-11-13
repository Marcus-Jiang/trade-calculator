/** 数字解析与格式化工具。 */

import type { Locale } from '@shared/i18n'

const formatterCache = new Map<number, Intl.NumberFormat>()

export function parseAmount(input: string): number | null {
  // NFKC 把全角数字/标点转为 ASCII，兼容从日语输入法或旧设置文件读到的内容
  const text = input.normalize('NFKC').replace(/,/g, '').trim()
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const normalized = Object.is(value, -0) ? 0 : value
  let formatter = formatterCache.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
    formatterCache.set(decimals, formatter)
  }
  return formatter.format(normalized)
}

/** 单价等细分金额保留更多有效小数，避免展示层四舍五入后对不上总价 */
export function formatAmount(
  value: number | null | undefined,
  decimals = 2,
  maxExtra = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const maxDigits = Math.max(decimals, Math.min(6, decimals + maxExtra))
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: maxDigits
  }).format(Object.is(value, -0) ? 0 : value)
}

/** 供输入框展示的纯数字字符串（无千分位） */
export function formatInput(value: number | null | undefined, maxDigits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const rounded = roundTo(value, maxDigits)
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** 汇率按量级自动选择小数位 */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '—'
  let digits = 4
  if (value < 0.01) digits = 6
  else if (value >= 1000) digits = 2
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)
}

/** 展开 1E+06 这类科学计数法；不是完整指数形式时返回 null。 */
function expandExponential(text: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text)
  if (!match) return null
  const intPart = match[1]
  const fraction = match[2] ?? ''
  const exponent = Number(match[3])
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null
  const digits = intPart + fraction
  const point = intPart.length + exponent
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`
  return `${digits.slice(0, point)}.${digits.slice(point)}`
}

/** 只保留数字与一个小数点，供输入框使用；全角字符会先转成半角。 */
export function cleanAmountInput(raw: string): string {
  // NFKC：全角数字 ０-９、全角逗号/句点转为 ASCII，避免被下面的过滤规则静默丢弃
  const normalized = raw.normalize('NFKC').replace(/[\s,]/g, '')
  // 粘贴 Excel 的 1E+06 时先展开，不能把 E 和 + 删掉后当成 106
  const expanded = expandExponential(normalized)
  if (expanded !== null) return expanded.slice(0, 24)
  // 正在输入的指数（如 "1e"、"1e+"）先保留，补全后再展开
  if (/^\d+(?:\.\d+)?[eE][+-]?\d*$/.test(normalized)) return normalized.slice(0, 24)
  let text = normalized.replace(/[^\d.]/g, '')
  const firstDot = text.indexOf('.')
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
  }
  return text.slice(0, 24)
}

export function formatTime(timestamp: number, locale: Locale = 'zh'): string {
  const date = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${pad(date.getMonth() + 1)}${locale === 'ja' ? '/' : '-'}${pad(date.getDate())}`
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
