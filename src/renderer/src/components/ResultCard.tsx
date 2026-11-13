import type { JSX } from 'react'
import type { Settings } from '@shared/types'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import type { ResultRow } from '../lib/calc'
import { formatAmount, formatNumber } from '../lib/format'
import { CurrencyFlag } from './CurrencyFlag'

interface ResultCardProps {
  settings: Settings
  rows: ResultRow[]
  onToast: (message: string) => void
}

export function ResultCard({ settings, rows, onToast }: ResultCardProps): JSX.Element {
  const { t } = useI18n()

  const copyQuote = (row: ResultRow): void => {
    if (row.quoteTotal === null) return
    // 与界面使用同一个格式化函数，避免 toFixed 与 Intl 在 .xx5 上舍入不同
    void api.copyText(`${formatNumber(row.quoteTotal, settings.decimals)} ${row.code}`)
    onToast(t('result.copied', { code: row.code }))
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('result.title')}</h2>
        <span className="card-hint">{t('result.hint', { rate: settings.taxRate })}</span>
      </div>

      <table className="result-table">
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '21%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-label={t('result.currencyAria')} />
            <th scope="col">{t('result.netCost')}</th>
            <th scope="col">{t('result.tax')}</th>
            <th scope="col">{t('result.quote')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <th scope="row">
                <CurrencyFlag code={row.code} small />
                {row.code}
              </th>
              <td title={formatNumber(row.netTotal, settings.decimals)}>
                {formatNumber(row.netTotal, settings.decimals)}
                <span className="cell-unit">
                  {t('result.unit', { value: formatAmount(row.netUnit, settings.decimals) })}
                </span>
              </td>
              <td title={formatNumber(row.tax, settings.decimals)}>
                {formatNumber(row.tax, settings.decimals)}
              </td>
              <td className="quote-cell">
                <button
                  type="button"
                  className="quote-copy"
                  onClick={() => copyQuote(row)}
                  disabled={row.quoteTotal === null}
                  title={row.quoteTotal === null ? t('result.noData') : t('result.copyTitle')}
                >
                  {formatNumber(row.quoteTotal, settings.decimals)}
                </button>
                <span className="cell-unit">
                  {t('result.unit', { value: formatAmount(row.quoteUnit, settings.decimals) })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="footnote">{t('result.footnote')}</p>
    </section>
  )
}
