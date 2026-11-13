import { useState } from 'react'
import type { JSX } from 'react'
import type { Settings } from '@shared/types'
import { useI18n } from '../i18n'
import { taxBreakdown } from '../lib/calc'
import type { CurrencyRow } from '../lib/calc'
import { CURRENCY_FLAGS } from '../lib/flags'
import { cleanAmountInput, formatInput, formatNumber, parseAmount } from '../lib/format'
import { CurrencySelect } from './CurrencySelect'

const TAX_PRESETS = [13, 9, 6, 3, 0]

interface QuoteCardProps {
  settings: Settings
  rows: CurrencyRow[]
  onEditCost: (code: string, raw: string, includesTax: boolean) => void
  onChangeCurrency: (index: number, code: string) => void
  onPatch: (patch: Partial<Settings>) => void
}

export function QuoteCard({
  settings,
  rows,
  onEditCost,
  onChangeCurrency,
  onPatch
}: QuoteCardProps): JSX.Element {
  const { t } = useI18n()
  const [markupDraft, setMarkupDraft] = useState(String(settings.markupRate))
  const taxIsPreset = TAX_PRESETS.includes(settings.taxRate)
  const [taxDraft, setTaxDraft] = useState(taxIsPreset ? '' : String(settings.taxRate))

  const updateMarkup = (raw: string): void => {
    const text = cleanAmountInput(raw)
    setMarkupDraft(text)
    if (text === '') {
      onPatch({ markupRate: 0 })
      return
    }
    const value = parseAmount(text)
    if (value !== null && value <= 1000) onPatch({ markupRate: value })
  }

  const chooseTaxPreset = (value: number): void => {
    setTaxDraft('')
    onPatch({ taxRate: value })
  }

  const updateTax = (raw: string): void => {
    const text = cleanAmountInput(raw)
    setTaxDraft(text)
    const value = parseAmount(text)
    if (value !== null && value >= 0 && value <= 100) onPatch({ taxRate: value })
  }

  /** 失焦时让输入框回到实际生效的值，避免显示 150% 却仍按旧税率计算 */
  const normalizeMarkup = (): void => {
    setMarkupDraft(String(settings.markupRate))
  }

  const normalizeTax = (): void => {
    setTaxDraft(TAX_PRESETS.includes(settings.taxRate) ? '' : String(settings.taxRate))
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('quote.title')}</h2>
        <span className="card-hint">{t('quote.hint')}</span>
      </div>

      <div className="tax-row">
        <span className="tax-label">{t('quote.taxRate')}</span>
        <div className="chips">
          {TAX_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`chip ${settings.taxRate === preset ? 'on' : ''}`}
              onClick={() => chooseTaxPreset(preset)}
            >
              {preset}%
            </button>
          ))}
          <div className={`chip chip-input ${taxIsPreset ? '' : 'on'}`}>
            <input
              value={taxDraft}
              onChange={(event) => updateTax(event.target.value)}
              onBlur={normalizeTax}
              inputMode="decimal"
              placeholder={t('quote.taxCustom')}
              aria-label={t('quote.taxCustomAria')}
            />
            <span>%</span>
          </div>
        </div>
      </div>

      <div className="quote-grid-head">
        <span>{t('quote.currency')}</span>
        <span title={t('quote.netUnitTitle')}>{t('quote.netUnit')}</span>
        <span title={t('quote.grossUnitTitle')}>{t('quote.grossUnit')}</span>
        <span className="right" title={t('quote.grossTotalTitle')}>
          {t('quote.grossTotal')}
        </span>
      </div>

      <div className="quote-rows">
        {rows.map((row, index) => {
          const primary = row.code === settings.currency
          const netValue =
            primary && !settings.costIncludesTax
              ? settings.costPrice
              : formatInput(taxBreakdown(row.unit, settings.taxRate, true).net, 4)
          const grossValue =
            primary && settings.costIncludesTax ? settings.costPrice : formatInput(row.unit, 4)
          return (
            <div
              className={`quote-row ${primary ? 'primary' : ''}`}
              key={`${row.code}-${index}`}
              title={primary ? t('quote.primaryTitle') : undefined}
            >
              <CurrencySelect
                compact
                flag={CURRENCY_FLAGS[row.code]}
                value={row.code}
                onChange={(code) => onChangeCurrency(index, code)}
                ariaLabel={t('quote.currencyAria', { index: index + 1 })}
              />
              <input
                className="input"
                inputMode="decimal"
                value={netValue}
                onChange={(event) => onEditCost(row.code, event.target.value, false)}
                placeholder="0.00"
                aria-label={t('quote.netCostAria', { code: row.code })}
                autoComplete="off"
              />
              <input
                className="input"
                inputMode="decimal"
                value={grossValue}
                onChange={(event) => onEditCost(row.code, event.target.value, true)}
                placeholder="0.00"
                aria-label={t('quote.grossCostAria', { code: row.code })}
                autoComplete="off"
              />
              <span className="cost-total" title={t('quote.grossTotalTitle')}>
                {formatNumber(row.total, settings.decimals)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="qty-row">
        <label htmlFor="quantity">{t('quote.quantity')}</label>
        <input
          id="quantity"
          className="input"
          inputMode="decimal"
          value={settings.quantity}
          onChange={(event) => onPatch({ quantity: cleanAmountInput(event.target.value) })}
          placeholder="1"
          autoComplete="off"
        />
        <label htmlFor="markup">{t('quote.markup')}</label>
        <input
          id="markup"
          className="input sm markup-input"
          inputMode="decimal"
          value={markupDraft}
          onChange={(event) => updateMarkup(event.target.value)}
          onBlur={normalizeMarkup}
          placeholder="0"
          aria-label={t('quote.markupAria')}
          autoComplete="off"
        />
        <span className="markup-pct">%</span>
      </div>
    </section>
  )
}
