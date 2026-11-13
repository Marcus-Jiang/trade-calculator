import { useState } from 'react'
import type { JSX } from 'react'
import type { RatesData, Settings } from '@shared/types'
import { useI18n } from '../i18n'
import { basePerUnit } from '../lib/calc'
import {
  cleanAmountInput,
  formatRate,
  formatTime,
  parseAmount,
  roundTo
} from '../lib/format'
import { CurrencyFlag } from './CurrencyFlag'
import { ChevronDownIcon, RefreshIcon } from './Icons'

interface RatesCardProps {
  settings: Settings
  rates: RatesData | null
  rateError: string | null
  refreshing: boolean
  onRefresh: () => void
  onPatch: (patch: Partial<Settings>) => void
}

export function RatesCard({
  settings,
  rates,
  rateError,
  refreshing,
  onRefresh,
  onPatch
}: RatesCardProps): JSX.Element {
  const { t, locale } = useI18n()
  let status: string
  if (rates) {
    const updated = t('rates.status', {
      provider: rates.provider,
      time: formatTime(rates.updatedAt, locale)
    })
    status = rates.stale ? t('rates.statusCached', { status: updated }) : updated
  } else {
    status = rateError ? t('rates.errorHint') : t('rates.loading')
  }
  const warn = Boolean(rates?.stale) || Boolean(rateError)
  const base = settings.baseCurrency
  const open = settings.ratesOpen
  // 本位币不在展示的三行里时补一行，保证用户能看到基准汇率
  const rateCodes = settings.currencies.includes(base)
    ? [...settings.currencies]
    : [...settings.currencies, base]

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('rates.title')}</h2>
        <div className="card-actions">
          <button
            type="button"
            className="profit-toggle"
            onClick={() => onPatch({ ratesOpen: !open })}
            aria-expanded={open}
            aria-controls="rates-body"
          >
            {open ? t('rates.collapse') : t('rates.expand')}
            <ChevronDownIcon className={open ? 'rot' : ''} />
          </button>
          <button
            type="button"
            className="icon-btn sm"
            onClick={onRefresh}
            disabled={refreshing}
            title={t('rates.refresh')}
            aria-label={t('rates.refresh')}
          >
            <RefreshIcon className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {open && (
        <div id="rates-body">
          <div
            className={`rate-status ${warn ? 'warn' : ''}`}
            title={rateError ?? undefined}
          >
            {status}
          </div>

          <div className="rate-list">
            {rateCodes.map((code) => (
              <RateRow
                key={`${code}-${base}`}
                code={code}
                settings={settings}
                rates={rates}
                onPatch={onPatch}
              />
            ))}
          </div>

          <p className="footnote">{t('rates.footnote')}</p>
        </div>
      )}
    </section>
  )
}

interface RateRowProps {
  code: string
  settings: Settings
  rates: RatesData | null
  onPatch: (patch: Partial<Settings>) => void
}

function RateRow({ code, settings, rates, onPatch }: RateRowProps): JSX.Element {
  const { t } = useI18n()
  const storedManual = settings.manualRates[code]
  const initialManual = storedManual !== undefined && storedManual > 0
  const [mode, setMode] = useState<'auto' | 'manual'>(initialManual ? 'manual' : 'auto')
  const [draft, setDraft] = useState(initialManual ? String(storedManual) : '')

  const autoRate = basePerUnit(rates, code, {}, settings.baseCurrency)
  const appliedRate = basePerUnit(rates, code, settings.manualRates, settings.baseCurrency)

  if (code === settings.baseCurrency) {
    return (
      <div className="rate-row">
        <span className="rate-code">
          <CurrencyFlag code={code} small />
          {code}
        </span>
        <span className="rate-native">{t('rates.native')}</span>
        <span />
      </div>
    )
  }

  const setManualMode = (): void => {
    setMode('manual')
    if (settings.manualRates[code] === undefined && autoRate !== null) {
      const next = { ...settings.manualRates, [code]: roundTo(autoRate, 6) }
      setDraft(String(next[code]))
      onPatch({ manualRates: next })
    }
  }

  const setAutoMode = (): void => {
    setMode('auto')
    setDraft('')
    if (settings.manualRates[code] !== undefined) {
      const next = { ...settings.manualRates }
      delete next[code]
      onPatch({ manualRates: next })
    }
  }

  const updateManual = (raw: string): void => {
    const text = cleanAmountInput(raw)
    setDraft(text)
    const value = parseAmount(text)
    const next = { ...settings.manualRates }
    if (value !== null && value > 0) next[code] = value
    else delete next[code]
    onPatch({ manualRates: next })
  }

  return (
    <div className="rate-row">
      <span className="rate-code">
        <CurrencyFlag code={code} small />
        {code}
      </span>

      <div className="rate-expr">
        <span>1 {code} =</span>
        {mode === 'manual' ? (
          <input
            className="input sm"
            inputMode="decimal"
            value={draft}
            onChange={(event) => updateManual(event.target.value)}
            onBlur={() => {
              const stored = settings.manualRates[code]
              setDraft(stored !== undefined && stored > 0 ? String(stored) : '')
            }}
            placeholder={autoRate !== null ? formatRate(autoRate) : t('rates.placeholder')}
            title={
              autoRate !== null
                ? t('rates.autoHint', { rate: formatRate(autoRate) })
                : t('rates.noAuto')
            }
            aria-label={t('rates.manualAria', { code })}
          />
        ) : (
          <span className={`rate-value ${appliedRate === null ? 'missing' : ''}`}>
            {formatRate(appliedRate)}
          </span>
        )}
        <span>{settings.baseCurrency}</span>
      </div>
      <div className="seg" role="group" aria-label={t('rates.sourceAria', { code })}>
        <button type="button" className={mode === 'auto' ? 'on' : ''} onClick={setAutoMode}>
          {t('rates.auto')}
        </button>
        <button type="button" className={mode === 'manual' ? 'on' : ''} onClick={setManualMode}>
          {t('rates.manual')}
        </button>
      </div>
    </div>
  )
}
