import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { currencyName } from '../src/renderer/src/lib/currency'
import { formatTime } from '../src/renderer/src/lib/format'
import { MESSAGES, resolveLocale, translate } from '../src/shared/i18n'
import type { MessageKey } from '../src/shared/i18n'

describe('resolveLocale', () => {
  it('auto 时日语系统显示日语，其余系统显示中文', () => {
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja')
    expect(resolveLocale('auto', 'ja')).toBe('ja')
    expect(resolveLocale('auto', 'JA_jp')).toBe('ja')
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh')
    expect(resolveLocale('auto', 'en-US')).toBe('zh')
    expect(resolveLocale('auto', undefined)).toBe('zh')
    expect(resolveLocale('auto', '')).toBe('zh')
  })

  it('显式选择优先于系统语言', () => {
    expect(resolveLocale('zh', 'ja-JP')).toBe('zh')
    expect(resolveLocale('ja', 'zh-CN')).toBe('ja')
  })
})

describe('translate', () => {
  it('替换 {name} 占位符', () => {
    expect(translate('ja', 'error.missingRate', { from: 'USD', to: 'JPY' })).toBe(
      'USD または JPY のレートがないため、入力通貨を切り替えられません'
    )
    expect(translate('zh', 'result.copied', { code: 'USD' })).toBe('已复制报价 USD')
  })

  it('缺少参数时保留占位符', () => {
    expect(translate('zh', 'quote.currencyAria')).toBe('第 {index} 个币种')
  })
})

describe('文案词典', () => {
  it('中文与日语包含相同的键，且文案非空', () => {
    const zhKeys = Object.keys(MESSAGES.zh).sort()
    expect(Object.keys(MESSAGES.ja).sort()).toEqual(zhKeys)
    for (const key of zhKeys as MessageKey[]) {
      expect(MESSAGES.zh[key].trim()).not.toBe('')
      expect(MESSAGES.ja[key].trim()).not.toBe('')
    }
  })
})

describe('前后端文案键一致性', () => {
  it('Rust 托盘/错误文案的键都存在于前端词典', () => {
    const rust = readFileSync('src-tauri/src/i18n.rs', 'utf8')
    const keys = [...rust.matchAll(/\("([a-z]+\.[A-Za-z0-9]+)",/g)].map((match) => match[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(MESSAGES.zh[key as MessageKey]).toBeTypeOf('string')
      expect(MESSAGES.ja[key as MessageKey]).toBeTypeOf('string')
    }
  })
})

describe('日期与币种名称跟随语言', () => {
  it('日期分隔符按语言区分', () => {
    const timestamp = new Date(2026, 10, 4, 8, 5).getTime()
    expect(formatTime(timestamp, 'zh')).toBe('11-04 08:05')
    expect(formatTime(timestamp, 'ja')).toBe('11/04 08:05')
  })

  it('币种名称按语言展示，未知币种回退为代码', () => {
    expect(currencyName('zh', 'USD')).toBe('美元')
    expect(currencyName('ja', 'USD')).toBe('米ドル')
    expect(currencyName('ja', 'XXX')).toBe('XXX')
  })
})
