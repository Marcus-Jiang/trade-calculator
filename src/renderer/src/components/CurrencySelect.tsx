import type { CSSProperties, JSX } from 'react'
import { useI18n } from '../i18n'
import { CURRENCIES, currencyName } from '../lib/currency'

interface CurrencySelectProps {
  value: string
  onChange: (code: string) => void
  compact?: boolean
  ariaLabel?: string
  /** 国旗 data URI，显示在下拉框左侧 */
  flag?: string
}

export function CurrencySelect({
  value,
  onChange,
  compact = false,
  ariaLabel,
  flag
}: CurrencySelectProps): JSX.Element {
  const { t, locale } = useI18n()
  // 兼容历史设置中已不在列表里的币种，避免下拉框显示空白
  const list = CURRENCIES.includes(value) ? CURRENCIES : [...CURRENCIES, value]
  const style = flag
    ? ({ '--flag-url': `url("${flag}")` } as CSSProperties)
    : undefined

  return (
    <select
      className={`select ${compact ? 'select-compact' : ''} ${flag ? 'has-flag' : ''}`}
      style={style}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel ?? t('quote.currency')}
    >
      {list.map((code) => (
        <option key={code} value={code}>
          {compact ? code : `${code} · ${currencyName(locale, code)}`}
        </option>
      ))}
    </select>
  )
}
