import { useState } from 'react'
import type { JSX } from 'react'
import type { Settings } from '@shared/types'
import { useI18n } from '../i18n'
import type { ProfitRow } from '../lib/calc'
import { cleanAmountInput, formatNumber, parseAmount } from '../lib/format'
import { CurrencyFlag } from './CurrencyFlag'
import { ChevronDownIcon } from './Icons'

interface ProfitCardProps {
  settings: Settings
  rows: ProfitRow[]
  onPatch: (patch: Partial<Settings>) => void
}

export function ProfitCard({ settings, rows, onPatch }: ProfitCardProps): JSX.Element {
  const { t } = useI18n()
  const [draft, setDraft] = useState(String(settings.rebateRate))
  const open = settings.profitOpen

  const updateRate = (raw: string): void => {
    const text = cleanAmountInput(raw)
    setDraft(text)
    if (text === '') {
      onPatch({ rebateRate: 0 })
      return
    }
    const value = parseAmount(text)
    if (value !== null && value <= 100) onPatch({ rebateRate: value })
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('profit.title')}</h2>
        <button
          type="button"
          className="profit-toggle"
          onClick={() => onPatch({ profitOpen: !open })}
          aria-expanded={open}
          aria-controls="profit-body"
        >
          {open ? t('profit.collapse') : t('profit.expand')}
          <ChevronDownIcon className={open ? 'rot' : ''} />
        </button>
      </div>

      {open && (
        <div id="profit-body">
          <div className="rebate-row">
            <label htmlFor="rebate-rate">{t('profit.rebate')}</label>
            <input
              id="rebate-rate"
              className="input sm"
              inputMode="decimal"
              value={draft}
              onChange={(event) => updateRate(event.target.value)}
              onBlur={() => setDraft(String(settings.rebateRate))}
              placeholder="0"
              autoComplete="off"
            />
            <span className="markup-pct">%</span>
          </div>

          <table className="result-table profit-table">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '28%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" aria-label={t('result.currencyAria')} />
                <th scope="col">{t('profit.direct')}</th>
                <th scope="col">{t('profit.rebateProfit')}</th>
                <th scope="col">{t('profit.total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">
                    <CurrencyFlag code={row.code} small />
                    {row.code}
                  </th>
                  <td title={formatNumber(row.direct, settings.decimals)}>
                    {formatNumber(row.direct, settings.decimals)}
                  </td>
                  <td title={formatNumber(row.rebate, settings.decimals)}>
                    {formatNumber(row.rebate, settings.decimals)}
                  </td>
                  <td
                    className="profit-total"
                    title={formatNumber(row.total, settings.decimals)}
                  >
                    {formatNumber(row.total, settings.decimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="footnote">{t('profit.footnote')}</p>
        </div>
      )}
    </section>
  )
}
